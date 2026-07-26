import { verifyImages } from './image-verifier.js'

const report = verifyImages()

for (const line of report.stdout) console.log(line)
for (const line of report.stderr) console.error(line)

if (report.exitCode !== 0) process.exitCode = report.exitCode
