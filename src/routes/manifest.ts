export type RouteDefinition = {
  method: 'get' | 'post' | 'patch' | 'delete'
  path: string
  public?: boolean
}

export const routeManifest: RouteDefinition[] = [
  { method: 'get', path: '/health', public: true },
  { method: 'post', path: '/auth/register', public: true },
  { method: 'post', path: '/auth/login', public: true },
  { method: 'post', path: '/auth/refresh', public: true },
  { method: 'post', path: '/auth/logout' },
  { method: 'post', path: '/auth/forgot-password', public: true },
  { method: 'post', path: '/auth/reset-password', public: true },
  { method: 'get', path: '/profile' },
  { method: 'patch', path: '/profile' },
  { method: 'post', path: '/profile/photo' },
  { method: 'patch', path: '/settings/notifications' },
  { method: 'get', path: '/categories' },
  { method: 'post', path: '/categories' },
  { method: 'get', path: '/categories/{id}' },
  { method: 'patch', path: '/categories/{id}' },
  { method: 'delete', path: '/categories/{id}' },
  { method: 'post', path: '/categories/{id}/restore' },
  { method: 'get', path: '/transactions' },
  { method: 'post', path: '/transactions' },
  { method: 'get', path: '/transactions/{id}' },
  { method: 'patch', path: '/transactions/{id}' },
  { method: 'delete', path: '/transactions/{id}' },
  { method: 'post', path: '/transactions/{id}/restore' },
  { method: 'get', path: '/savings' },
  { method: 'post', path: '/savings' },
  { method: 'get', path: '/savings/{id}' },
  { method: 'patch', path: '/savings/{id}' },
  { method: 'delete', path: '/savings/{id}' },
  { method: 'post', path: '/savings/{id}/restore' },
  { method: 'get', path: '/activities/recent' },
]
