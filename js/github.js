// GitHub ticket links. A session's optional `github` ("owner/repo") sends its ticket and task links to that
// repository's issues instead of Azure DevOps. GitHub redirects /issues/N to the pull request when N is one.
import {adoUrl} from "./util.js";

const REPO = /^[\w.-]+\/[\w.-]+$/;

/** The issue link for id in "owner/repo". */
export const githubUrl = (id, repo) => "https://github.com/" + repo.trim() + "/issues/" + encodeURIComponent(id);

/** A ticket or task link for session data s: its GitHub repo when it names a well-formed one, else Azure DevOps. */
export const ticketUrl = (id, s) =>
  typeof s?.github === "string" && REPO.test(s.github.trim()) ? githubUrl(id, s.github) : adoUrl(id, s?.ado);
