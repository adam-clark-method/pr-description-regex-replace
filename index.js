import { getInput, notice, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

export const replaceTrelloPlaceholder = (regex, body, shortCodes) => {
    const matches = body.match(regex);
    const linkText = shortCodes
        .map((x) => {
            return `[Trello Link: ${x}](https://trello.com/c/${x})`;
        })
        .join("\n");
    if (matches) {
        matches.forEach((match) => {
            body = body.replace(
                match,
                `<!--TRELLO_LINK_START-->\n${linkText}\n<!--TRELLO_LINK_END-->`,
            );
        });
    } else {
        throw new Error(`Template string not found in your PR description '${regex}'`);
    }
    return body;
};

export const run = async () => {
    const defaultRegex = "<!--REPLACE_START-->[\\s\\S]*<!--REPLACE_END-->";
    const replacementRegex = getInput("replacementRegex") || defaultRegex;
    const replacementRegexFlags = getInput("replacementRegexFlags") || "gm";
    const titleRegex = getInput("titleRegex") || "\\[(.*)\\]";
    const commitsRegex = getInput("commitsRegex") || "\\[(.*)\\]";
    const shortCodeSource = getInput("shortCodeSource") || "both";
    const replacementRE = RegExp(replacementRegex, replacementRegexFlags);
    const titleRE = RegExp(titleRegex);
    const commitsRE = RegExp(commitsRegex);
    const token = getInput("token", { required: true });

    notice(`Using replacement regex: ${replacementRegex}`);
    notice(`Using replacement regex flags: ${replacementRegexFlags}`);
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

    const shortCodes = [];
    if (shortCodeSource === "both" || shortCodeSource === "title") {
        // get short codes from title with titleRE and match group
        const title = data.title;
        const matches = title.match(titleRE);
        try {
            const code = matches[1];
            shortCodes.push(code);
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
        shortCodes.push(
            ...commits.reduce((results, x) => {
                const msg = x.commit.message;
                const matches = msg.match(commitsRE);
                try {
                    const code = matches[1];
                    if (code) {
                        results.push(code);
                    }
                } catch {
                    notice(
                        `Commit message ${x.commit.message} does not contain a valid Trello short code. Please check your commits regex.`,
                    );
                }
                return results;
            }, []),
        );
    }

    let body = data.body;

    notice(`Injecting ${shortCodes.length} Trello links into PR body`);
    try {
        body = replaceTrelloPlaceholder(replacementRE, body, shortCodes);
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
