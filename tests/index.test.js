// Ref: https://jeffrafter.com/working-with-github-actions/

import * as core from "@actions/core";
import * as github from "@actions/github";
import nock from "nock";

import { run } from "../index";

nock.disableNetConnect();

const originalEnv = process.env;

const noticeMock = jest.spyOn(core, "notice").mockImplementation();
const failedMock = jest.spyOn(core, "setFailed").mockImplementation();

const mockPrGet = jest.fn();
const mockPrGetReturn = jest.fn();
const mockCommitGet = jest.fn();
const mockCommitGetReturn = jest.fn();
const mockPrList = jest.fn();
const mockPrUpdate = jest.fn();

describe("pull request event", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.resetModules();
        nock.cleanAll();

        process.env = { ...originalEnv };

        const owner = "owner-name";
        const repo = "repo-name";
        const pull_number = 123;
        const defaultContext = {
            eventName: "pull_request",
            payload: {
                pull_request: {
                    number: pull_number,
                },
                ref: "refs/heads/branch-with-pr",
            },
            repo: {
                owner: owner,
                repo: repo,
            },
            sha: "sha",
        };

        // eslint-disable-next-line no-import-assign
        github.context = defaultContext;

        mockPrGetReturn.mockImplementation(() => {
            return {
                title: "[12345] PR Title",
                body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START--><!--TRELLO_LINK_END-->`,
            };
        });
        mockCommitGetReturn.mockImplementation(() => {
            return [
                {
                    commit: { message: "[abcdefg] blah" },
                },
                {
                    commit: { message: "[hijklmn] arg" },
                },
                {
                    commit: { message: "[opqrstu] foo" },
                },
                {
                    commit: { message: " [vwxyz] fug" },
                },
                {
                    commit: { message: " [vwxyz] fug" },
                },
                {
                    commit: { message: "dig dug" },
                },
            ];
        });
        nock("https://api.github.com")
            .get(`/repos/${owner}/${repo}/pulls/${pull_number}`, () => {
                mockPrGet();
                return true;
            })
            .reply(200, () => mockPrGetReturn());

        nock("https://api.github.com")
            .get(`/repos/${owner}/${repo}/pulls/${pull_number}/commits`, () => {
                mockCommitGet();
                return true;
            })
            .reply(200, () => mockCommitGetReturn());

        nock("https://api.github.com")
            .get(`/repos/${owner}/${repo}/commits/${defaultContext.sha}/pulls`, () => {
                mockPrList();
                return true;
            })
            .reply(200, [
                {
                    head: {
                        ref: "branch-without-pr",
                    },
                    state: "other",
                    number: pull_number + 1,
                },
                {
                    head: {
                        ref: "draft-branch-with-pr",
                    },
                    state: "draft",
                    number: pull_number + 2,
                },
                {
                    head: {
                        ref: "branch-with-pr",
                    },
                    state: "open",
                    number: pull_number,
                },
            ]);

        nock("https://api.github.com")
            .patch(`/repos/${owner}/${repo}/pulls/${pull_number}`, (body) => {
                mockPrUpdate(body);
                return true;
            })
            .reply(200);
    });

    it("should replace PR body content on total regex match", async () => {
        await run();

        expect(mockPrGet).toHaveBeenCalledTimes(1);
        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 5 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
[Trello Link: hijklmn](https://trello.com/c/hijklmn)
[Trello Link: opqrstu](https://trello.com/c/opqrstu)
[Trello Link: vwxyz](https://trello.com/c/vwxyz)
<!--TRELLO_LINK_END-->`,
        });
        expect(mockPrList).not.toHaveBeenCalled();
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should replace PR body content on case insensitive regex", async () => {
        process.env["INPUT_REPLACEMENTREGEXFLAGS"] = "i";

        await run();

        expect(mockPrGet).toHaveBeenCalledTimes(1);
        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 5 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
[Trello Link: hijklmn](https://trello.com/c/hijklmn)
[Trello Link: opqrstu](https://trello.com/c/opqrstu)
[Trello Link: vwxyz](https://trello.com/c/vwxyz)
<!--TRELLO_LINK_END-->`,
        });
        expect(mockPrList).not.toHaveBeenCalled();
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should get just a title shortcode", async () => {
        process.env["INPUT_SHORTCODESOURCE"] = "title";

        await run();

        expect(mockPrGet).toHaveBeenCalledTimes(1);
        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 1 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
<!--TRELLO_LINK_END-->`,
        });
        expect(mockPrList).not.toHaveBeenCalled();
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should get just commit shortcodes", async () => {
        process.env["INPUT_SHORTCODESOURCE"] = "commits";

        await run();

        expect(mockPrGet).toHaveBeenCalledTimes(1);
        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 4 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
[Trello Link: hijklmn](https://trello.com/c/hijklmn)
[Trello Link: opqrstu](https://trello.com/c/opqrstu)
[Trello Link: vwxyz](https://trello.com/c/vwxyz)
<!--TRELLO_LINK_END-->`,
        });
        expect(mockPrList).not.toHaveBeenCalled();
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should lookup the PR via SHA and set content", async () => {
        github.context.eventName = "push";
        github.context.payload.pull_request = undefined;

        await run();

        expect(mockPrList).toHaveBeenCalledTimes(1);
        expect(mockPrGet).toHaveBeenCalledTimes(1);
        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 5 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
[Trello Link: hijklmn](https://trello.com/c/hijklmn)
[Trello Link: opqrstu](https://trello.com/c/opqrstu)
[Trello Link: vwxyz](https://trello.com/c/vwxyz)
<!--TRELLO_LINK_END-->`,
        });
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should replace a list of links with the template string", async () => {
        mockPrGetReturn.mockImplementation(() => {
            return {
                title: "[12345] PR Title",
                body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
<!--TRELLO_LINK_END-->`,
            };
        });

        await run();

        expect(noticeMock).toHaveBeenCalledWith(
            "Injecting 5 Trello links into PR body",
        );
        expect(mockPrUpdate).toHaveBeenCalledWith({
            body: `## Trello
<!-- DO NOT TOUCH -->
<!--TRELLO_LINK_START-->
[Trello Link: 12345](https://trello.com/c/12345)
[Trello Link: abcdefg](https://trello.com/c/abcdefg)
[Trello Link: hijklmn](https://trello.com/c/hijklmn)
[Trello Link: opqrstu](https://trello.com/c/opqrstu)
[Trello Link: vwxyz](https://trello.com/c/vwxyz)
<!--TRELLO_LINK_END-->`,
        });
        expect(failedMock).not.toHaveBeenCalled();
    });

    it("should fail when PR cannot be found", async () => {
        github.context.eventName = "other";
        github.context.payload.pull_request = undefined;
        github.context.payload.ref = "refs/heads/branch-without-pr";

        const errorMessage = `No open pull request found for ${github.context.eventName}, ${github.context.sha}`;
        try {
            await run();
        } catch (e) {
            expect(e.message).toEqual(errorMessage);
        }

        expect(failedMock).toHaveBeenCalledWith(errorMessage);

        expect(mockPrList).toHaveBeenCalled();
        expect(mockPrGet).not.toHaveBeenCalled();
        expect(mockPrUpdate).not.toHaveBeenCalled();
    });

    it("should fail if it cannot find the template string", async () => {
        const errorMessage =
            "Template string not found in your PR description '/<!--TRELLO_LINK_START-->[\\s\\S]*<!--TRELLO_LINK_END-->/gm'";
        mockPrGetReturn.mockImplementation(() => {
            return {
                title: "[12345] PR Title",
                body: `REGULAR PR
NO TEMPLATE STRING`,
            };
        });

        try {
            await run();
        } catch (e) {
            expect(e.message).toEqual(errorMessage);
        }

        expect(failedMock).toHaveBeenCalledWith(errorMessage);
    });
});
