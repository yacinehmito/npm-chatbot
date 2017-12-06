// @flow
import express from 'express';
import { reify } from 'flow-runtime';
import type { Type } from 'flow-runtime';
import type { NextFunction, $Request } from 'express';

type Message = Object

type Context = {
    name: string,
    lifespanCount: number,
    parameters: Object,
};

type Intent = Object;

type EventInput = Object;

type QueryResult = {
    queryText: string,
    languageCode?: string,
    speechRecognitionConfidence?: number,
    action?: string,
    parameters: Object,
    allRequiredParamsPresent?: boolean,
    fulfillmentTex?: string,
    fulfillmentMessages?: Message[],
    webhookSource?: string,
    webhookPayload?: Object,
    outputContexts?: Context,
    intent: Intent,
    intentDetectionConfidence?: number,
    diagnosticInfo?: Object,
};

type OriginalDetectIntentRequest = {
  source?: string,
  payload: Object
}

export type WebhookRequest = {
  session?: string,
  responseId: string,
  queryResult: QueryResult,
  originalDetectIntentRequest?: OriginalDetectIntentRequest,
};

export type WebhookResponse = {
  fulfillmentText?: string,
  fulfillmentMessages?: Message[],
  source?: string,
  payload?: Object,
  outputContexts?: Context[],
  followupEventInput?: EventInput,
};

const WebhookRequestType: Type = (reify: Type<WebhookRequest>);

function castToRequest(data: any): WebhookRequest {
  WebhookRequestType.assert(data);
  return data;
}

class DialogflowWebhookRouter extends express.Router {
  // express.Router inherits Function so we can't define methods in the prototype
  useHook: (path: string, hook: WebhookRequest => Promise<WebhookResponse>) => mixed
  constructor() {
    super();
    this.use(express.json());
    this.useHook = (path, hook) => {
      this.post(path, (req: $Request, res, next: NextFunction) => {
        let request: WebhookRequest;
        try {
          request = castToRequest(req.body);
        } catch (err) {
          console.error('Error reading the request:', req.body);
          res.status(400).send({ error: 'Request not recognized as Dialogflow webhook request.' });
          return;
        }
        hook(request)
          .then((response) => {
            res.json(response);
          })
          .catch(next);
      });
    };
  }
}

export default DialogflowWebhookRouter;

