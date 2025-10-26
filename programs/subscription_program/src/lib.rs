use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("8vB5vwjvaqi3ZTRnzzQcw8MifMhbE4EJgnKfGfFNkH44");

#[program]
pub mod subscription_program {
    use super::*;

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        
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

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32,
        seeds = [b"subscription", user.key().as_ref()],
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
}
