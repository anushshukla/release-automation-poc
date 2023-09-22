import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import * as qs from "qs";
import axios from "axios"

// Ref: https://www.lee-ford.co.uk/connect-graph-api-sdk-app-permissions/
export class MSAuthProvider implements AuthenticationProvider {

    public async getAccessToken(): Promise<string> {

        const url: string = "https://login.microsoftonline.com/" + process.env.MS_APP_TENANT_ID + "/oauth2/v2.0/token";

        const body: object = {
            client_id: process.env.MS_APP_CLIENT_ID,
            client_secret: process.env.MS_APP_PASSWORD,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials"
        }

        try {

            let response = await axios.post(url, qs.stringify(body))

            if (response.status == 200) {

                return response.data.access_token;

            } else {

                throw new Error("Non 200OK response on obtaining token...")

            }

        }
        catch (error) {

            throw new Error("Error on obtaining token...")

        }

    }
}