// CloudFront viewer-request Function (cloudfront-js-2.0), attached to the default behavior of the production
// distribution (#862). Paths whose last segment has no file extension are served as /index.html, so every SPA page is a
// normal S3 response and the viewer-response headers Function (web-security-headers.mjs --function) runs on it.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
