@AGENTS.md

# Buzz Package Quick Context

Work from the `buzz-startos` package root. Application source inspection belongs
in the sibling `../buzz9` mirror; packaging guidance belongs in
`../start-technologies/projects/start-sdk/docs/src/`.

Use Node `22.23.1`, run focused tests before `npm test`, then run type,
formatting, SDK lint, and image-verification gates. Build native packages with
`make x86` and `make arm`. Never access or expose the workspace private signing
key.
