import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from './chatgpt-auth';
import CashApp from './cash-app';
export const dynamic='force-dynamic';
export default async function Page(){
 const identity=await getChatGPTUser();
 return <CashApp signedIn={!!identity} signIn={chatGPTSignInPath('/')} signOut={chatGPTSignOutPath('/')} />;
}
