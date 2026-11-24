/**
 * Thrown by `iserver` reads while another platform (TWS, IBKR Mobile, the
 * Client Portal elsewhere) holds IBKR's trading session.
 */
export class IbkrBrokerageUnavailableError extends Error {
  override name = "IbkrBrokerageUnavailableError";
}
