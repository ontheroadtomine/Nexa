import { AgentTool } from '../types';
import { truncateText } from './shared';

export const webFetchTool: AgentTool = {
  name: 'web_fetch',
  schema: {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a public HTTP/HTTPS URL and return text content. Use for current public web pages or API endpoints when a URL is known.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'HTTP or HTTPS URL.' },
        },
        required: ['url'],
      },
    },
  },
  async run(args) {
    const url = String(args.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs are supported.');
    const response = await fetch(url, {
      headers: {
        Accept: 'text/plain,text/html,application/json,*/*',
        'User-Agent': 'PigAgent/1.0',
      },
    });
    const text = await response.text();
    return {
      url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      text: truncateText(text, 50_000),
    };
  },
};
