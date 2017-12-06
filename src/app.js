// @flow
import express from 'express';
import DialogflowWebhookRouter from './dialogflowWebhookRouter';
import npmChatbotHook from './npmChatbotHook';

const app = express();

const router = new DialogflowWebhookRouter();

router.useHook('/find-package', npmChatbotHook);

app.use(router);

app.listen(process.env.PORT || 3000);
