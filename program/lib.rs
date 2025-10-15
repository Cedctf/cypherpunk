use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("YourProgramIDHere111111111111111111111111111");

#[program]
pub mod subscription_program {
    use super::*;

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let clock = Clock::get()?;
        
        // Transfer 0.001 SOL from user to program
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        );
        transfer(transfer_ctx, 1_000_000)?; // 0.001 SOL in lamports

        subscription.user = ctx.accounts.user.key();
        subscription.subscribed_at = clock.unix_timestamp;
        subscription.expires_at = clock.unix_timestamp + 30 * 24 * 60 * 60; // 1 month (30 days)
        subscription.is_active = true;

        Ok(())
    }

    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.is_active = false;
        Ok(())
    }

    pub fn is_subscribed(ctx: Context<CheckSubscription>) -> Result<bool> {
        let subscription = &ctx.accounts.subscription;
        let clock = Clock::get()?;
        
        let is_active = subscription.is_active && clock.unix_timestamp < subscription.expires_at;
        Ok(is_active)
    }
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"subscription", user.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Treasury account to receive subscription fees
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription", user.key().as_ref()],
        bump,
        has_one = user
    )]
    pub subscription: Account<'info, Subscription>,
    
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckSubscription<'info> {
    #[account(
        seeds = [b"subscription", user.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    
    /// CHECK: User account for PDA derivation
    pub user: AccountInfo<'info>,
}

#[account]
pub struct Subscription {
    pub user: Pubkey,           // 32 bytes
    pub subscribed_at: i64,     // 8 bytes
    pub expires_at: i64,        // 8 bytes
    pub is_active: bool,        // 1 byte
}
