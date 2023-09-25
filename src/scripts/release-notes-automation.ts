import "dotenv/config";
import axios from "axios";
import { Octokit } from "@octokit/core";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { OctokitResponse } from "@octokit/types";
// import { Client, ClientOptions } from "@microsoft/microsoft-graph-client";
// import { MSAuthProvider } from "./util/MSAuthProvider";

// const client = Client.initWithMiddleware({
//   authProvider: new MSAuthProvider(),
// });
const octokit = new Octokit({ auth: process.env.GITHUB_REPO_TOKEN });
const DynamoDB = new DynamoDBClient({
  apiVersion: "2012-08-10",
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

interface ReleaseNoteSchema {
  id: number;
  tag_name: string;
  body: string;
  draft: string;
}

// interface ChatMessage {
//   body: {
//     content: string;
//   };
// }

function getLatestReleaseNote(
  sdk: Octokit,
  author: string,
  repo: string
): Promise<OctokitResponse<ReleaseNoteSchema>> {
  return sdk.request(`GET /repos/${author}/${repo}/releases/latest`, {
    owner: "anushshukla",
    repo: "release-automation-poc",
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function publishLatestReleaseNote(
  sdk: Octokit,
  author: string,
  repo: string,
  releaseId: number
) {
  return sdk.request(`PATCH /repos/${author}/${repo}/releases/${releaseId}`, {
    owner: author,
    repo: repo,
    draft: true,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function updateDatabase(version: string, releaseNote: string) {
  return DynamoDB.send(new PutItemCommand({
    TableName: "release-note-automation-poc",
    Item: {
      APP: { S: 'frontend' },
      version: { S: version },
      note: { S: releaseNote },
    },
    ReturnConsumedCapacity: "TOTAL",
    ReturnValues: "ALL_OLD",
  })).catch((error) => {
    console.log("updateDatabase error", error);
    throw error;
  });
}

async function broadcastChannelMessage(
  msChWebhook: string,
  releaseNote: string
) {
  // await client.api(`/teams/${teamId}/channels/${channelId}/messages`).post(releaseNote);
  if (!msChWebhook) {
    console.log("MS Channel Webhook is not abled!");
  }
  // Ref: https://support.powell-software.com/hc/en-us/articles/10212114162578-TIPS-How-to-find-a-team-id-and-a-channel-id-in-Microsoft-Teams

  return axios
    .post(msChWebhook, {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.2",
            body: [
              {
                type: "TextBlock",
                text: releaseNote,
              },
            ],
          },
        },
      ],
    })
    .catch((error) => {
      console.error("broadcastChannelMessage supressed error", error);
      return;
    });
}

export default async function automateReleases() {
  const author = "anushshukla";
  const repo = "release-automation-poc";
  const latestReleaseNote = await getLatestReleaseNote(
    octokit,
    author,
    repo
  ).catch(console.log);
  if (!latestReleaseNote) {
    throw new Error("No latest release note found!");
  }
  console.log("latestReleaseNote.data", JSON.stringify(latestReleaseNote.data));

  const {
    id: releaseId,
    tag_name: version,
    body: releaseNote,
    draft: isDraft,
  } = latestReleaseNote.data;

  isDraft && publishLatestReleaseNote(octokit, author, repo, releaseId);
  console.log("release note published");
  await updateDatabase(version, releaseNote).catch(console.log);
  console.log("database updated");
  const msChWebhook = process.env.MS_CH_WEB_HOOK as string;
  await broadcastChannelMessage(msChWebhook, releaseNote).catch(console.log);
  console.log("release note broadcaste to channel");
}

automateReleases();
