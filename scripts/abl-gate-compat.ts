/**
 * ABL Gate プログラムとの互換レイヤー。
 * TypeScript SDK のアカウント順序バグを Rust SDK の正しい構造で上書きする。
 *
 * Rust SDK の正しいアカウント順序:
 *   create_list:       [authority(ro,signer), payer(rw,signer), list_config(rw), system_program]
 *   setup_extra_metas: [authority(ro,signer), payer(rw,signer), mint_config(ro), mint(ro), extra_metas(rw), system_program, ...lists]
 *   add_wallet:        [authority(ro,signer), payer(rw,signer), list_config(rw), wallet(ro), wallet_entry(rw), system_program]
 */
import {
  AccountRole,
  address,
  type Address,
  type KeyPairSigner,
  type Instruction,
} from "@solana/kit";
import { ABL_PROGRAM_ADDRESS } from "@token-acl/abl-sdk";
import {
  getModeEncoder,
  findListConfigPda,
  findWalletEntryPda,
} from "@token-acl/abl-sdk";
import { findMintConfigPda, findThawExtraMetasAccountPda } from "@token-acl/sdk";
import { getAddressEncoder, getU8Encoder, getStructEncoder, transformEncoder } from "@solana/kit";

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

// Borsh-like encoder for instruction data
function encodeCreateList(mode: number, seed: Address): Uint8Array {
  // discriminator(1) + mode(1) + seed(32) = 34 bytes
  const buf = new Uint8Array(34);
  buf[0] = 1; // CREATE_LIST_DISCRIMINATOR
  buf[1] = mode;
  const seedBytes = getAddressEncoder().encode(seed);
  buf.set(seedBytes, 2);
  return buf;
}

function encodeAddWallet(): Uint8Array {
  // discriminator(1) only
  const buf = new Uint8Array(1);
  buf[0] = 2; // ADD_WALLET_DISCRIMINATOR
  return buf;
}

function encodeSetupExtraMetas(): Uint8Array {
  // discriminator(1) only
  const buf = new Uint8Array(1);
  buf[0] = 4; // SETUP_EXTRA_METAS_DISCRIMINATOR
  return buf;
}

export type Mode = 0 | 1 | 2; // Allow=0, AllowAllEoas=1, Block=2

export function createListInstruction(
  authority: KeyPairSigner,
  payer: KeyPairSigner,
  listConfig: Address,
  mode: Mode,
  seed: Address
): Instruction {
  return {
    programAddress: address(ABL_PROGRAM_ADDRESS),
    accounts: [
      { address: authority.address, role: AccountRole.READONLY_SIGNER },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: listConfig, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: encodeCreateList(mode, seed),
  };
}

export function addWalletInstruction(
  authority: KeyPairSigner,
  payer: KeyPairSigner,
  listConfig: Address,
  wallet: Address,
  walletEntry: Address
): Instruction {
  return {
    programAddress: address(ABL_PROGRAM_ADDRESS),
    accounts: [
      { address: authority.address, role: AccountRole.READONLY_SIGNER },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: listConfig, role: AccountRole.WRITABLE },
      { address: wallet, role: AccountRole.READONLY },
      { address: walletEntry, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: encodeAddWallet(),
  };
}

export function setupExtraMetasInstruction(
  authority: KeyPairSigner,
  payer: KeyPairSigner,
  mintConfig: Address,
  mint: Address,
  extraMetas: Address,
  lists: Address[]
): Instruction {
  return {
    programAddress: address(ABL_PROGRAM_ADDRESS),
    accounts: [
      { address: authority.address, role: AccountRole.READONLY_SIGNER },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: mintConfig, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: extraMetas, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      ...lists.map((l) => ({ address: l, role: AccountRole.READONLY })),
    ],
    data: encodeSetupExtraMetas(),
  };
}

// PDA helpers re-exported for convenience
export { findListConfigPda, findWalletEntryPda, findMintConfigPda };

// ExtraMetas PDA must be derived using the gating program (ABL Gate), NOT Token ACL program
export async function findThawExtraMetasPdaForGate(mint: Address): Promise<readonly [Address, number]> {
  return findThawExtraMetasAccountPda(
    { mint },
    { programAddress: address(ABL_PROGRAM_ADDRESS) }
  );
}
