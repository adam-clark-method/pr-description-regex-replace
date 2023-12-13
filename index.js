import { getInput, notice, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

export const replaceTrelloPlaceholder = (start, end, body, shortCodes) => {
    notice(`Shortcodes found ${JSON.stringify(Object.keys(shortCodes))}}`);
    const startIndex = body.indexOf(start);
    const endIndex = body.indexOf(end);
    const startString = body.substring(0, startIndex + start.length);
    const endString = body.substring(endIndex);
    if (startIndex === -1 || endIndex === -1) {
        throw new Error(
            `Template start or end string not found in your PR description '${start}' or '${end}'`,
        );
    }
    const linkText = Object.keys(shortCodes)
        .map((x) => {
            return `[Trello Link: ${x}](https://trello.com/c/${x})`;
        })
        .join("\n");
    return `${startString}\n${linkText}\n${endString}`;
};

export const run = async () => {
    const replacementStart = getInput("replacementStart") || "<!--REPLACE_START-->";
    const replacementEnd = getInput("replacementEnd") || "<!--REPLACE_END-->";
    const titleRegex = getInput("titleRegex") || "\\[(.*)\\]";
    const commitsRegex = getInput("commitsRegex") || "\\[(.*)\\]";
    const shortCodeSource = getInput("shortCodeSource") || "both";
    const titleRE = RegExp(titleRegex);
    const commitsRE = RegExp(commitsRegex);
    const token = getInput("token", { required: true });

    notice(`Using replacement start: ${replacementStart}`);
    notice(`Using replacement end: ${replacementEnd}`);
    notice(`Using title regex: ${titleRegex}`);
    notice(`Using commits regex: ${commitsRegex}`);
    notice(`Using short code source: ${shortCodeSource}`);

    const { owner, repo } = context.repo;
    const octokit = getOctokit(token);

    let prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
        // not a pull_request event, try and find the PR number from the commit sha
        const { data: pullRequests } =
            await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                owner,
                repo,
                commit_sha: context.sha,
            });

        const candidatePullRequests = pullRequests.filter(
            (pr) =>
                context.payload.ref === `refs/heads/${pr.head.ref}` &&
                pr.state === "open",
        );

        prNumber = candidatePullRequests?.[0]?.number;
    }

    if (!prNumber) {
        setFailed(
            `No open pull request found for ${context.eventName}, ${context.sha}`,
        );
        return;
    }

    const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
    });

    const shortCodes = {};
    if (shortCodeSource === "both" || shortCodeSource === "title") {
        // get short codes from title with titleRE and match group
        const title = data.title;
        const matches = title.match(titleRE);
        try {
            const code = matches[1];
            shortCodes[code] = true;
        } catch {
            setFailed(
                "Title does not contain a valid Trello short code. Please check your title regex.",
            );
        }
    }
    if (shortCodeSource === "both" || shortCodeSource === "commits") {
        const { data: commits } = await octokit.rest.pulls.listCommits({
            owner,
            repo,
            pull_number: prNumber,
        });
        commits.forEach((x) => {
            const msg = x.commit.message;
            const matches = msg.match(commitsRE);
            try {
                const code = matches[1];
                if (code) {
                    shortCodes[code] = true;
                }
            } catch {
                notice(
                    `Commit message ${x.commit.message} does not contain a valid Trello short code. Please check your commits regex.`,
                );
            }
        });
    }

    let body = data.body;

    notice(`Injecting ${Object.keys(shortCodes).length} Trello links into PR body`);
    try {
        body = replaceTrelloPlaceholder(
            replacementStart,
            replacementEnd,
            body,
            shortCodes,
        );
    } catch (err) {
        setFailed(err.message);
    }

    await octokit.rest.pulls.update({
        owner,
        repo,
        body: body,
        pull_number: prNumber,
    });
};

run().catch((error) => setFailed(error.message));
