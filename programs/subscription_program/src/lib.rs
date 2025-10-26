use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("8vB5vwjvaqi3ZTRnzzQcw8MifMhbE4EJgnKfGfFNkH44");

const SUBSCRIPTION_DURATION: i64 = 30 * 24 * 60 * 60; // 30 days in seconds

#[program]
pub mod subscription_program {
    use super::*;

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;
        
        // Transfer 0.001 SOL from user to vault PDA
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        transfer(transfer_ctx, 1_000_000)?; // 0.001 SOL in lamports

        subscription.user = ctx.accounts.user.key();
        
        // If already subscribed and not expired, extend from current expiry
        // Otherwise, start fresh from now
        if subscription.expires_at > clock.unix_timestamp {
            subscription.expires_at += SUBSCRIPTION_DURATION;
        } else {
            subscription.expires_at = clock.unix_timestamp + SUBSCRIPTION_DURATION;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 8,
        seeds = [b"subscription_v2", user.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Vault PDA to receive subscription fees
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Subscription {
    pub user: Pubkey,           // 32 bytes
    pub expires_at: i64,        // 8 bytes
}
