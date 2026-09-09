// Hands the browser a file the app just built in memory.
//
// A Blob plus an object URL plus a synthetic click is the only way to do
// this without a server to serve the file from -- there is no endpoint to
// point at, the CSV exists for the length of this function. The URL is
// revoked straight after: it pins the blob in memory until it is, and
// nothing needs it once the download has started.
export function downloadTextFile(input: {
  readonly fileName: string
  readonly text: string
  readonly mimeType: string
}): void {
  const blob = new Blob([input.text], { type: input.mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = input.fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
