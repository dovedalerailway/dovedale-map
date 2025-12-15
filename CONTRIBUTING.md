# Contributing
## Creating an Issue
- **Reporting bugs:** If you find a bug, please provide image/video proof of it and make sure there isn't an existing issue for it.
- **Feature requests:** Check that there isn't an existing issue. We ask that PRs that add features first create a feature request so the maintainers can discuss whether the feature is desired and the design of that feature.
## Creating a Pull Request
### Before You Start
Before making a pull request that adds functionality to the map, please first check if there's a feature request for it. If not, please make one yourself so we can discuss if it's desired and, if so, what the design could look like.

### Setting Up
To setup the map to test client-side changes, run these commands (must have [Bun](https://bun.com/get) installed):
```sh
bun install # Install dependencies
bun dev # Start web server
```
Then, head to http://localhost:3000 to view the map.
We're working on providing a simple way to emulate actual position requests the server might receive - check [#28](https://github.com/dovedalerailway/dovedale-map/issues/28) for more info.

### Submitting the Pull Request
When making a pull request, please ensure there aren't any unrelated changes, features or fixes.
We would much rather have 5 PRs for a feature each than 1 with all 5 features so we can review and merge them separately.

## Use of AI
Although we welcome proper use of AI tools, we ask you to follow a few core principles.
- Comments, PR and issue descriptions should be written in your own voice
- Clear and human communication is more important than perfect grammar or spelling
- Feel free to use AI tools to generate ideas or small code snippets, but we won't accept PRs that are mostly or entirely AI-written
- Only submit contributions that you fully understand and are able to explain
- Contributions should show your own reasoning and problem-solving
