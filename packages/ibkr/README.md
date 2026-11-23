# @nora/ibkr

IBKR client used by the web app, written in Effect (`HttpClient`, Schema, services).

- `@nora/ibkr/browser-login`: the browser login (SRP password exchange and second factor) and the `IbkrBrowserSession` service.
- `@nora/ibkr/browser-schemas`: browser-safe schemas for the login routes.
- `@nora/ibkr/api-schemas`: schemas for Client Portal portfolio and market data responses.
- `@nora/ibkr/market-stream`: live quotes over IBKR's websocket.
- `@nora/ibkr/demo`: canned responses for the demo account.
- `@nora/ibkr/login-error`: the shared login error.
