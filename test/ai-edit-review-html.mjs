import assert from 'node:assert/strict';
import { renderAIEditReviewHTML } from '../tools/ai-edit-review-html.mjs';

const hostile = '</script><img src=x onerror=alert(1)>&\u2028';
const html = renderAIEditReviewHTML( {
	worldTitle: hostile,
	worldId: 'tw-world:review-page-test',
	taskId: 'task-test',
	instruction: hostile,
	baseSourceHash: `sha256:${'a'.repeat( 64 )}`,
	candidateSourceHash: `sha256:${'b'.repeat( 64 )}`,
	validation: { candidateSource: 'passed' },
	objectChanges: [ { id: 'tw-object:test', status: 'added', before: null, after: { label: hostile } } ],
	portalChanges: [], worldChanges: [], generatedAssets: [],
} );

assert.ok( html.includes( 'content="default-src &#39;none&#39;' ) || html.includes( "default-src 'none'" ) );
assert.ok( html.includes( '\\u003c/script\\u003e\\u003cimg' ), 'untrusted report text is escaped before embedding' );
assert.ok( ! html.includes( '<img src=x' ), 'report content cannot add markup to the review page' );
assert.ok( html.includes( 'textContent' ), 'dynamic text is written without HTML interpretation' );
assert.ok( ! html.includes( 'fetch(' ) && ! html.includes( 'XMLHttpRequest' ), 'review page makes no network requests' );
console.log( 'ok owner review HTML escapes untrusted text and uses no network requests' );
