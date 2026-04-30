import { routeManifest } from '../src/routes/manifest'

type ContractResult = {
  documented: string[]
  implemented: string[]
  missing: string[]
  extra: string[]
}

const httpMethods = new Set(['get', 'post', 'patch', 'delete', 'put', 'options', 'head'])
const allowedExtra = new Set(['GET /health'])

export async function checkOpenApiContract(openApiPath = 'docs/openapi.yaml'): Promise<ContractResult> {
  const text = await Bun.file(openApiPath).text()
  const documented: string[] = []
  let currentPath: string | null = null

  for (const line of text.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/)
    if (pathMatch) {
      currentPath = pathMatch[1]
      continue
    }
    const methodMatch = line.match(/^    ([a-z]+):\s*$/)
    if (currentPath && methodMatch && httpMethods.has(methodMatch[1])) {
      documented.push(`${methodMatch[1].toUpperCase()} ${currentPath}`)
    }
  }

  const implemented = routeManifest.map((route) => `${route.method.toUpperCase()} ${route.path}`)
  const implementedSet = new Set(implemented)
  const documentedSet = new Set(documented)
  const missing = documented.filter((route) => !implementedSet.has(route))
  const extra = implemented.filter((route) => !documentedSet.has(route) && !allowedExtra.has(route))

  return { documented, implemented, missing, extra }
}

if (import.meta.main) {
  const result = await checkOpenApiContract()
  if (result.missing.length || result.extra.length) {
    console.error(JSON.stringify({ missing: result.missing, extra: result.extra }, null, 2))
    process.exit(1)
  }
  console.log(`OpenAPI contract OK: ${result.documented.length} documented routes covered`)
}
