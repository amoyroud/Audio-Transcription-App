export const auth0Config = {
  domain: "dev-k1vxkq0ayy8nhqeu.us.auth0.com",
  clientId: "KScmJ4fYxDYV2cajWMgKFNsX9RBqqGOZ",
  authorizationParams: {
    redirect_uri: window.location.origin,
    scope: "openid profile email"
  },
  cacheLocation: "localstorage",
  useRefreshTokens: true,
}; 