import fs from 'fs'
import path from 'path'

export async function modifyPackageJson(
  fileName: string,
  properties: {key: string; value: string}[]
): Promise<void> {
  const file: Record<string, any> = await import(fileName)
  for (const prop of properties) {
    file[prop.key] = prop.value
  }
  fs.writeFile(
    path.join(__dirname, fileName),
    JSON.stringify(file, null, 2),
    err => {
      if (err) {
        return console.log(err)
      }
      console.log(`Writing to ${fileName}`)
    }
  )
}
