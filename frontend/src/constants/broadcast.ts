export const BROADCAST_CHANNELS = {
  AUTH: "auth-channel",
  CART: "cart_channel",
} as const;

export const BROADCAST_EVENTS = {
  // Auth Events
  AUTH_LOGIN_SUCCESS: "login_success",
  AUTH_LOGOUT_SUCCESS: "logout_success",

  // Cart Events
  CART_UPDATED: "cart_updated",
} as const;
