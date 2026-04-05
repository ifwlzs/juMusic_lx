async function seedMediaLibraryConnections(repository, seeds = []) {
  if (!seeds.length) return []

  const nextConnections = await repository.getConnections()

  for (const seed of seeds) {
    if (!seed?.connection?.connectionId) continue

    const nextConnection = {
      ...seed.connection,
    }
    const connectionIndex = nextConnections.findIndex(item => item.connectionId === nextConnection.connectionId)
    const prevConnection = connectionIndex > -1 ? nextConnections[connectionIndex] : null

    if (seed.credential) {
      nextConnection.credentialRef ??= prevConnection?.credentialRef ?? `credential__${nextConnection.connectionId}`
      await repository.saveCredential(nextConnection.credentialRef, seed.credential)
    }

    if (seed.credential && prevConnection?.credentialRef && nextConnection.credentialRef && prevConnection.credentialRef !== nextConnection.credentialRef) {
      await repository.removeCredential(prevConnection.credentialRef)
    }

    if (connectionIndex > -1) {
      nextConnections[connectionIndex] = {
        ...prevConnection,
        ...nextConnection,
      }
    } else {
      nextConnections.push(nextConnection)
    }
  }

  await repository.saveConnections(nextConnections)
  return nextConnections
}

module.exports = {
  seedMediaLibraryConnections,
}
