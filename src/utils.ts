import fs from 'fs'
import path from 'path'

export async function modifyPackageJson(
  fileName: string,
  properties: {key: string; value: string}[]
): Promise<void> {
  const filePath = path.resolve(process.cwd(), fileName)
  const file = fs.readFileSync(filePath, 'utf8')
  const newFile: Record<string, any> = JSON.parse(file)
  for (const prop of properties) {
    newFile[prop.key] = prop.value
  }
  fs.writeFile(filePath, JSON.stringify(newFile, null, 2), err => {
    if (err) {
      throw new Error(err.message)
    }
    console.log(`Writing to ${fileName}`)
  })
}
