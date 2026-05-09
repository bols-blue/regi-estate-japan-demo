import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairSignerFromBytes,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
  pipe,
  createTransactionMessage,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type Instruction,
} from "@solana/kit";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const DEVNET_WS = "wss://api.devnet.solana.com";

export type Client = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  payer: KeyPairSigner;
};

export async function createClient(): Promise<Client> {
  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_WS);
  const keypairPath = join(homedir(), ".config", "solana", "id.json");
  const keypairBytes = new Uint8Array(
    JSON.parse(readFileSync(keypairPath, "utf-8"))
  );
  const payer = await createKeyPairSignerFromBytes(keypairBytes);
  return { rpc, rpcSubscriptions, payer };
}

export async function buildAndSend(
  client: Client,
  instructions: Instruction[]
): Promise<string> {
  const { rpc, rpcSubscriptions, payer } = client;
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );

  const signed = await signTransactionMessageWithSigners(message);
  const sig = getSignatureFromTransaction(signed);
  await sendAndConfirm(signed as any, { commitment: "confirmed" });
  return sig;
}
