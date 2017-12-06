// @flow
import type { WebhookRequest, WebhookResponse } from './dialogflowWebhookRouter';
import type { Package } from './types';
import { search } from './npmService';

export function extractKeywordsFromRequest(request: WebhookRequest): string[] {
  const npmKeywords = request.queryResult.parameters.npmKeywords || [];
  const typeTechnologies = request.queryResult.parameters.typeTechnologies || [];
  return npmKeywords.concat(typeTechnologies);
}

export async function findPackageFromKeywords(keywords: string[]): Promise<?Package> {
  const result = await search({ text: keywords.join(' ') });
  if (result.total === 0) return undefined;
  return result.objects[0].package;
}


export function formatResponseFromPackage(pkg: ?Package): WebhookResponse {
  if (!pkg) {
    return {
      fulfillmentText: 'No package',
    };
  }
  return {
    fulfillmentText: pkg.name,
  };
}

async function npmChatbotHook(request: WebhookRequest): Promise<WebhookResponse> {
  const keywords = extractKeywordsFromRequest(request);
  const pkg = await findPackageFromKeywords(keywords);
  return formatResponseFromPackage(pkg);
}


export default npmChatbotHook;
