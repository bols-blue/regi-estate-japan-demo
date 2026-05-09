import { NextResponse } from "next/server";

const DEVNET_RPC = "https://api.devnet.solana.com";
const MINT_ADDRESS = "FkD73NkVGZmkHujFrGKKCT9iagHGpfnCisPsxR1VWJPF";

// AccountRole: READONLY=0, WRITABLE=1, READONLY_SIGNER=2, WRITABLE_SIGNER=3
function roleToFlags(role: number) {
  return {
    isSigner: role >= 2,
    isWritable: role === 1 || role === 3,
  };
}

export async function POST(req: Request) {
  try {
    const { investorAddress, payerAddress } = await req.json();
    if (!investorAddress || !payerAddress) {
      return NextResponse.json({ error: "investorAddress and payerAddress required" }, { status: 400 });
    }

    const {
      createSolanaRpc,
      address,
      fetchEncodedAccount,
    } = await import("@solana/kit");

    const { getMintDecoder } = await import("@solana-program/token-2022");
    const { createTokenAccountWithAcl } = await import("@token-acl/sdk");

    const rpc = createSolanaRpc(DEVNET_RPC);
    const mintAddr = address(MINT_ADDRESS);

    const mintAccount = await fetchEncodedAccount(rpc, mintAddr);
    if (!mintAccount.exists) {
      return NextResponse.json({ error: "Mint account not found" }, { status: 404 });
    }
    const mintData = getMintDecoder().decode(mintAccount.data);

    // fake payer with signTransactions so isTransactionSigner() returns true
    const fakePayer = {
      address: address(payerAddress),
      signTransactions: async (txs: unknown[]) => txs,
    };

    const instructions = await createTokenAccountWithAcl(
      rpc as never,
      mintData as never,
      mintAddr,
      address(investorAddress),
      fakePayer as never
    );

    // convert kit instructions → JSON-serializable format
    const serialized = instructions.map((ix: {
      programAddress: string;
      accounts: { address: string; role: number }[];
      data: Uint8Array;
    }) => ({
      programId: ix.programAddress,
      keys: ix.accounts.map((acc) => ({
        pubkey: acc.address,
        ...roleToFlags(acc.role),
      })),
      data: Array.from(ix.data),
    }));

    return NextResponse.json({ instructions: serialized });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
