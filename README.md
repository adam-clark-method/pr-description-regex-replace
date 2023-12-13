# Update Pull Request Description With Trello Links

Forked from: https://github.com/nefrob/pr-description/tree/master

GitHub action to replace markdown comment in a pull request description with trello links built from commit messages or pr titles or both.

## Usage

This action supports `pull_request` and `push` events (where the `push` event ocurred on a branch with an open pull request).

### Inputs
-   `replacementRegex`: The regex to match against the PR body and replace with `content`. Defaults to `"<!--TRELLO_LINK_START--><!--TRELLO_LINK_END-->"`.
-   `replacementRegexFlags`: The regex flags to use. Defaults to `"g"`.
-   `titleRegex`: The regex to use to pull the shortcode out of the title.
-   `commitsRegex`: The regex to use to pull the shortcodes out of the commit messages
-   `shortCodeSource`: Where to pull the short code from (title|commits|both)
-   `token`: The GitHub token to use.

### Example Workflows

-   Simple replace search string in the PR description with Trello Links:

    ```yaml
    on:
        pull_request:

    jobs:
        update-pr-description:
            runs-on: ubuntu-latest
            steps:
                - name: Checkout
                  uses: actions/checkout@v3
                - name: Update PR Description
                  uses: adamclark.method/pr-description@v1.1.1
                  with:
                      replacementRegex: "<!--TRELLO_LINK_START-->[\s\S]*<!--TRELLO_LINK_END-->"
                      shortCodeSource: "commits"
                      commitsRegex: "[(.*)]"
                      token: ${{ secrets.GITHUB_TOKEN }}
    ```
