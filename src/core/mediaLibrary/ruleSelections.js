function removeImportSelection(draft = {}, selectionId) {
  return {
    ...draft,
    directories: (draft.directories || []).filter(item => item.selectionId !== selectionId),
    tracks: (draft.tracks || []).filter(item => item.selectionId !== selectionId),
  }
}

module.exports = {
  removeImportSelection,
}
