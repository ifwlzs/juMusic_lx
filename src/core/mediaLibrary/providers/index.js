function createProviderRegistry(providers = []) {
  const map = new Map()
  for (const provider of providers) {
    if (!provider?.type) continue
    map.set(provider.type, provider)
  }
  return {
    get(type) {
      return map.get(type)
    },
  }
}

module.exports = {
  createProviderRegistry,
}
