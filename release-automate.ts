import 'dotenv/config'
import { Octokit } from "@octokit/core";
import AWS from "aws-sdk";
import { Client, ClientOptions } from "@microsoft/microsoft-graph-client";
import { MSAuthProvider } from "./util/MSAuthProvider";
import { OctokitResponse } from '@octokit/types';

const octokit = new Octokit({ auth: process.env.GITHUB_REPO_TOKEN });
let clientOptions: ClientOptions = {
	authProvider: new MSAuthProvider,
};
const client = Client.initWithMiddleware(clientOptions);
AWS.config.update({ region: process.env.AWS_REGION });
const ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10', accessKeyId: process.env.AWS_ACCESS_KEY_ID , secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY });

interface ReleaseNoteSchema {
  id: number;
  tag_name: number;
  body: string;
  draft: string;
}

function getLatestReleaseNote(sdk: Octokit, author: string, repo: string): Promise<OctokitResponse<ReleaseNoteSchema>> {
  return sdk.request(`GET /repos/${author}/${repo}/releases/latest`, {
    owner: "anushshukla",
    repo: "release-automation-poc",
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function publishLatestReleaseNote(sdk: Octokit, author: string, repo: string, releaseId: number) {
  return sdk.request(`PATCH /repos/${author}/${repo}/releases/${releaseId}`, {
    owner: author,
    repo: repo,
    draft: true,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function updateDatabase(version: number, releaseNote: string) {
  return ddb.putItem({
    TableName: 'release-note-automation-poc',
    Item: {
      'APP' : { S: 'frontend' },
      'version' : { N: version.toString() },
      'note' : { S: releaseNote }
    }
  });
}

async function broadcastChannelMessage(teamId: string, channelId: string, releaseNote: string) {
  await client.api(`/teams/${teamId}/channels/${channelId}/messages`).post(releaseNote);
}

export default async function automateReleases() {
  const author = "anushshukla";
  const repo = "release-automation-poc";
  const latestReleaseNote = await getLatestReleaseNote(octokit, author, repo).catch(console.log);
  if (!latestReleaseNote) {
    throw new Error("No latest release note found!");
  }
  console.log('latestReleaseNote.data', latestReleaseNote.data);

  const {
    id: releaseId,
    tag_name: version,
    body: releaseNote,
    draft: isPublished,
  } = latestReleaseNote.data;

  !isPublished && publishLatestReleaseNote(octokit, author, repo, releaseId);
  console.log('release note published');
  updateDatabase(version, releaseNote).catch(console.log);
  console.log('database updated');
  broadcastChannelMessage(releaseNote, process.env.MS_RELEASE_NOTE_TEAM_ID as string, process.env.MS_RELEASE_NOTE_CH_ID as string).catch(console.log);
  console.log('release note broadcaste to channel');
}

automateReleases();