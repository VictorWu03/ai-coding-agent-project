import { Octokit } from "@octokit/rest";
import { createNodeMiddleware } from "@octokit/webhooks";
import { WebhookEventMap } from "@octokit/webhooks-definitions/schema";
import * as http from "http";
import { App } from "octokit";
import winston from "winston";
import { env } from "./env"; // Ensure you validate environment variables
import { processPullRequest } from "./review-agent";
import { applyReview } from "./reviews";

// Configure winston for logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
  ],
});

// Initialize the GitHub App
const reviewApp = new App({
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_PRIVATE_KEY,
  webhooks: {
    secret: env.GITHUB_WEBHOOK_SECRET,
  },
});

// Utility: Get changes per file for a pull request
const getChangesPerFile = async (
  payload: WebhookEventMap["pull_request"]
) => {
  try {
    const octokit = await reviewApp.getInstallationOctokit(
      payload.installation.id
    );
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: payload.pull_request.number,
    });

    logger.info("Fetched pull request file changes", { files });
    return files;
  } catch (error) {
    logger.error("Error fetching pull request files", { error, payload });
    throw error;
  }
};

// Handler for "pull_request.opened"
async function handlePullRequestOpened({
  octokit,
  payload,
}: {
  octokit: Octokit;
  payload: WebhookEventMap["pull_request"];
}) {
  logger.info("Received pull request event", {
    pullRequestNumber: payload.pull_request.number,
    repository: payload.repository.full_name,
  });

  try {
    const files = await getChangesPerFile(payload);
    const review = await processPullRequest(octokit, payload, files, true);

    await applyReview({ octokit, payload, review });
    logger.info("Successfully processed and submitted review", {
      pullRequestNumber: payload.pull_request.number,
    });
  } catch (error) {
    logger.error("Error handling pull request opened event", {
      error,
      pullRequestNumber: payload.pull_request.number,
      repository: payload.repository.full_name,
    });
  }
}

// Attach webhook listener
reviewApp.webhooks.on("pull_request.opened", handlePullRequestOpened);

// Middleware for HTTP server
const reviewWebhook = "/api/review";
const reviewMiddleware = createNodeMiddleware(reviewApp.webhooks, {
  path: reviewWebhook,
});

// HTTP server setup
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === reviewWebhook) {
    reviewMiddleware(req, res);
  } else {
    res.statusCode = 404;
    res.end("Not Found");
  }
});

// Start the server
server.listen(port, () => {
  logger.info(`Server is running and listening on port ${port}`);
});
// import { Octokit } from "@octokit/rest";
// import { createNodeMiddleware } from "@octokit/webhooks";
// import { WebhookEventMap } from "@octokit/webhooks-definitions/schema";
// import * as http from "http";
// import { App } from "octokit";
// import { Review } from "./constants";
// import { env } from "./env";
// import { processPullRequest } from "./review-agent";
// import { applyReview } from "./reviews";

// // This creates a new instance of the Octokit App class.
// const reviewApp = new App({
//   appId: env.GITHUB_APP_ID,
//   privateKey: env.GITHUB_PRIVATE_KEY,
//   webhooks: {
//     secret: env.GITHUB_WEBHOOK_SECRET,
//   },
// });

// const getChangesPerFile = async (payload: WebhookEventMap["pull_request"]) => {
//   try {
//     const octokit = await reviewApp.getInstallationOctokit(
//       payload.installation.id
//     );
//     const { data: files } = await octokit.rest.pulls.listFiles({
//       owner: payload.repository.owner.login,
//       repo: payload.repository.name,
//       pull_number: payload.pull_request.number,
//     });
//     console.dir({ files }, { depth: null });
//     return files;
//   } catch (exc) {
//     console.log("exc");
//     return [];
//   }
// };

// // This adds an event handler that your code will call later. When this event handler is called, it will log the event to the console. Then, it will use GitHub's REST API to add a comment to the pull request that triggered the event.
// async function handlePullRequestOpened({
//   octokit,
//   payload,
// }: {
//   octokit: Octokit;
//   payload: WebhookEventMap["pull_request"];
// }) {
//   console.log(
//     `Received a pull request event for #${payload.pull_request.number}`
//   );
//   // const reposWithInlineEnabled = new Set<number>([601904706, 701925328]);
//   // const canInlineSuggest = reposWithInlineEnabled.has(payload.repository.id);
//   try {
//     console.log("pr info", {
//       id: payload.repository.id,
//       fullName: payload.repository.full_name,
//       url: payload.repository.html_url,
//     });
//     const files = await getChangesPerFile(payload);
//     const review: Review = await processPullRequest(
//       octokit,
//       payload,
//       files,
//       true
//     );
//     await applyReview({ octokit, payload, review });
//     console.log("Review Submitted");
//   } catch (exc) {
//     console.log(exc);
//   }
// }

// // This sets up a webhook event listener. When your app receives a webhook event from GitHub with a `X-GitHub-Event` header value of `pull_request` and an `action` payload value of `opened`, it calls the `handlePullRequestOpened` event handler that is defined above.
// //@ts-ignore
// reviewApp.webhooks.on("pull_request.opened", handlePullRequestOpened);

// const port = process.env.PORT || 3000;
// const reviewWebhook = `/api/review`;

// const reviewMiddleware = createNodeMiddleware(reviewApp.webhooks, {
//   path: "/api/review",
// });

// const server = http.createServer((req, res) => {
//   if (req.url === reviewWebhook) {
//     reviewMiddleware(req, res);
//   } else {
//     res.statusCode = 404;
//     res.end();
//   }
// });

// // This creates a Node.js server that listens for incoming HTTP requests (including webhook payloads from GitHub) on the specified port. When the server receives a request, it executes the `middleware` function that you defined earlier. Once the server is running, it logs messages to the console to indicate that it is listening.
// server.listen(port, () => {
//   console.log(`Server is listening for events.`);
//   console.log("Press Ctrl + C to quit.");
// });
