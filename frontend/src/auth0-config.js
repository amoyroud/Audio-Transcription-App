// Auth0 configuration - Update these values with your Auth0 app settings
export const auth0Config = {
  domain: "dev-k1vxkq0ayy8nhqeu.us.auth0.com",
  clientId: "KScmJ4fYxDYV2cajWMgKFNsX9RBqqGOZ",
  authorizationParams: {
    redirect_uri: process.env.NODE_ENV === 'production' 
      ? 'https://audio.antoinemoyroud.com'
      : 'http://localhost:3001'
  },
  logoutParams: {
    returnTo: process.env.NODE_ENV === 'production'
      ? 'https://audio.antoinemoyroud.com'
      : 'http://localhost:3001'
  },
  cacheLocation: "localstorage",
  useRefreshTokens: true,
}; 