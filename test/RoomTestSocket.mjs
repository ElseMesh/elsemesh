import { WebSocket as Socket } from 'ws';

// Existing test fixtures describe identities in URLs locally; only the join
// message goes over the wire. Never send test credentials as HTTP queries.
export class WebSocket extends Socket {
	constructor(input, options) {
		const url = new URL(input);
		const join = { type: 'join', ...Object.fromEntries(url.searchParams) };
		url.search = '';
		super(url, options);
		this.once('open', () => this.send(JSON.stringify(join)));
	}
}
