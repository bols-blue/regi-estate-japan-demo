use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::TokenAccount;

declare_id!("BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322");

// ================================================================
// Errors
// ================================================================

#[error_code]
pub enum DividendError {
    #[msg("Investor is not KYC approved (token account is frozen)")]
    InvestorNotKyc,
    #[msg("Investor has zero token balance")]
    ZeroBalance,
    #[msg("Calculated payout is zero")]
    ZeroPayout,
    #[msg("Previous epoch still has unclaimed dividends")]
    PreviousEpochNotFullyClaimed,
    #[msg("No dividend has been deposited for this epoch")]
    NoDividend,
    #[msg("Unauthorized: caller is not the distributor authority")]
    Unauthorized,
}

// ================================================================
// State accounts
// ================================================================

#[account]
pub struct DistributorState {
    /// 発行体ウォレット
    pub authority: Pubkey,
    /// Security Token の Mint アドレス
    pub mint: Pubkey,
    /// 現在の配当エポック番号（1始まり）
    pub epoch: u64,
    /// エポック開始時の総発行量スナップショット
    pub total_supply: u64,
    /// エポックの配当総額（lamports）
    pub dividend_amount: u64,
    /// 投資家が請求済みの累計（lamports）
    pub claimed_amount: u64,
    pub bump: u8,
}

impl DistributorState {
    pub const LEN: usize = 8   // discriminator
        + 32  // authority
        + 32  // mint
        + 8   // epoch
        + 8   // total_supply
        + 8   // dividend_amount
        + 8   // claimed_amount
        + 1;  // bump
}

/// 投資家×エポックごとに作成される請求済みレコード
#[account]
pub struct ClaimRecord {
    pub epoch: u64,
    /// 受け取った lamports
    pub amount: u64,
    pub bump: u8,
}

impl ClaimRecord {
    pub const LEN: usize = 8 + 8 + 8 + 1;
}

// ================================================================
// Instructions
// ================================================================

#[program]
pub mod dividend_distributor {
    use super::*;

    /// 発行体がディストリビューターを初期化する
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.distributor;
        state.authority = ctx.accounts.authority.key();
        state.mint = ctx.accounts.mint.key();
        state.epoch = 0;
        state.total_supply = 0;
        state.dividend_amount = 0;
        state.claimed_amount = 0;
        state.bump = ctx.bumps.distributor;
        msg!("DividendDistributor initialized for mint: {}", ctx.accounts.mint.key());
        Ok(())
    }

    /// 発行体が配当を入金し、新しいエポックを開始する
    ///
    /// - amount:       配当総額（lamports）
    /// - total_supply: スナップショット時点の総発行量（トークン枚数）
    pub fn deposit_dividend(
        ctx: Context<DepositDividend>,
        amount: u64,
        total_supply: u64,
    ) -> Result<()> {
        // 前エポックに未請求残がある場合は入金不可（epoch==0 は初回なので除外）
        if ctx.accounts.distributor.epoch > 0 {
            require!(
                ctx.accounts.distributor.claimed_amount >= ctx.accounts.distributor.dividend_amount,
                DividendError::PreviousEpochNotFullyClaimed
            );
        }

        // state 更新（&mut borrow は各代入後すぐ解放される）
        ctx.accounts.distributor.epoch =
            ctx.accounts.distributor.epoch.checked_add(1).unwrap();
        ctx.accounts.distributor.total_supply = total_supply;
        ctx.accounts.distributor.dividend_amount = amount;
        ctx.accounts.distributor.claimed_amount = 0;

        let new_epoch = ctx.accounts.distributor.epoch;

        // SOL を authority → distributor PDA へ転送
        // (&mut borrow が残っていない状態で to_account_info() を呼ぶ)
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.distributor.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount)?;

        msg!(
            "Epoch {} started: {} lamports / {} tokens total supply",
            new_epoch,
            amount,
            total_supply
        );
        Ok(())
    }

    /// 投資家が自分の按分配当を請求する
    ///
    /// payout = investor_balance / total_supply * dividend_amount
    pub fn claim_dividend(ctx: Context<ClaimDividend>) -> Result<()> {
        // --- 検証フェーズ（borrows を一つのスコープに閉じ込める） ---
        let (epoch, payout) = {
            let state = &ctx.accounts.distributor;
            let token_account = &ctx.accounts.investor_token_account;

            // KYC チェック: Frozen でないこと（Token ACL がアンフリーズ済み）
            require!(!token_account.is_frozen(), DividendError::InvestorNotKyc);

            require!(state.dividend_amount > 0, DividendError::NoDividend);

            let balance = token_account.amount;
            require!(balance > 0, DividendError::ZeroBalance);

            // 按分: u128 で精度を確保
            let payout = (balance as u128)
                .checked_mul(state.dividend_amount as u128)
                .and_then(|v| v.checked_div(state.total_supply as u128))
                .unwrap_or(0) as u64;
            require!(payout > 0, DividendError::ZeroPayout);

            (state.epoch, payout)
        };

        // --- ラモート移動: distributor PDA → investor ---
        **ctx
            .accounts
            .distributor
            .to_account_info()
            .try_borrow_mut_lamports()? -= payout;
        **ctx
            .accounts
            .investor
            .to_account_info()
            .try_borrow_mut_lamports()? += payout;

        // --- ClaimRecord 初期化 ---
        let record = &mut ctx.accounts.claim_record;
        record.epoch = epoch;
        record.amount = payout;
        record.bump = ctx.bumps.claim_record;

        // --- DistributorState 更新 ---
        ctx.accounts.distributor.claimed_amount = ctx
            .accounts
            .distributor
            .claimed_amount
            .checked_add(payout)
            .unwrap();

        msg!("Investor claimed {} lamports (epoch {})", payout, epoch);
        Ok(())
    }
}

// ================================================================
// Account contexts
// ================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = DistributorState::LEN,
        seeds = [b"distributor", mint.key().as_ref()],
        bump,
    )]
    pub distributor: Account<'info, DistributorState>,

    /// CHECK: Token-2022 Mint。キーのみ使用。
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositDividend<'info> {
    #[account(
        mut,
        constraint = authority.key() == distributor.authority @ DividendError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"distributor", distributor.mint.as_ref()],
        bump = distributor.bump,
    )]
    pub distributor: Account<'info, DistributorState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimDividend<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"distributor", distributor.mint.as_ref()],
        bump = distributor.bump,
    )]
    pub distributor: Account<'info, DistributorState>,

    /// Token-2022 トークンアカウント（KYC 状態・残高の確認に使用）
    #[account(
        constraint = investor_token_account.owner == investor.key()
            @ DividendError::Unauthorized,
        constraint = investor_token_account.mint == distributor.mint
            @ DividendError::Unauthorized,
    )]
    pub investor_token_account: InterfaceAccount<'info, TokenAccount>,

    /// (investor, epoch) ごとの二重請求防止レコード
    #[account(
        init,
        payer = investor,
        space = ClaimRecord::LEN,
        seeds = [
            b"claim",
            distributor.key().as_ref(),
            investor.key().as_ref(),
            &distributor.epoch.to_le_bytes(),
        ],
        bump,
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    pub system_program: Program<'info, System>,
}
