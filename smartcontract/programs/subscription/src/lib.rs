use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("A91myHLb8YQYA986sXxpx9wjj4rUCFLhv6VB6tSXmE1n");

#[program]
pub mod subscription {
    use super::*;

    /// Initialize the subscription program
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        program_state.owner = ctx.accounts.owner.key();
        program_state.next_plan_id = 1;
        program_state.vault_bump = ctx.bumps.program_vault;
        Ok(())
    }

    /// Create a new subscription plan (only owner)
    pub fn create_plan(
        ctx: Context<CreatePlan>,
        price: u64,
        duration: i64,
    ) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        let plan = &mut ctx.accounts.plan;

        plan.plan_id = program_state.next_plan_id;
        plan.price = price;
        plan.duration = duration;
        plan.active = true;

        emit!(PlanCreated {
            plan_id: plan.plan_id,
            price,
            duration,
        });

        program_state.next_plan_id += 1;
        Ok(())
    }

    /// Subscribe to a plan
    pub fn subscribe(ctx: Context<Subscribe>, plan_id: u32) -> Result<()> {
        let plan = &ctx.accounts.plan;
        let user_subscription = &mut ctx.accounts.user_subscription;
        let clock = Clock::get()?;

        require!(plan.active, ErrorCode::PlanInactive);
        require!(plan.plan_id == plan_id, ErrorCode::InvalidPlanId);

        // Transfer payment from user to program vault
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.program_vault.to_account_info(),
            },
        );
        transfer(cpi_context, plan.price)?;

        let end_time = clock.unix_timestamp + plan.duration;

        user_subscription.user = ctx.accounts.user.key();
        user_subscription.plan_id = plan_id;
        user_subscription.start_time = clock.unix_timestamp;
        user_subscription.end_time = end_time;
        user_subscription.active = true;

        emit!(Subscribed {
            user: ctx.accounts.user.key(),
            plan_id,
            end_time,
        });

        Ok(())
    }

    /// Cancel active subscription
    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        let user_subscription = &mut ctx.accounts.user_subscription;

        require!(user_subscription.active, ErrorCode::NoActiveSubscription);

        user_subscription.active = false;

        emit!(SubscriptionCancelled {
            user: ctx.accounts.user.key(),
        });

        Ok(())
    }

    /// Withdraw funds from the vault (only owner)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let vault_bump = ctx.accounts.program_state.vault_bump;
        
        let seeds: &[&[u8]] = &[
            b"vault",
            &[vault_bump],
        ];
        let signer_seeds = &[seeds];

        // Transfer from vault to owner
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.program_vault.to_account_info(),
                to: ctx.accounts.owner.to_account_info(),
            },
            signer_seeds,
        );
        transfer(cpi_context, amount)?;

        Ok(())
    }

    /// Check if a subscription is currently active (view function)
    pub fn is_subscription_active(ctx: Context<CheckSubscription>) -> Result<bool> {
        let user_subscription = &ctx.accounts.user_subscription;
        let clock = Clock::get()?;

        let is_active = user_subscription.active && clock.unix_timestamp <= user_subscription.end_time;
        Ok(is_active)
    }
}

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::INIT_SPACE,
        seeds = [b"program_state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub program_vault: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePlan<'info> {
    #[account(
        mut,
        seeds = [b"program_state"],
        bump,
        has_one = owner
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        init,
        payer = owner,
        space = 8 + SubscriptionPlan::INIT_SPACE,
        seeds = [b"plan", &program_state.next_plan_id.to_le_bytes()],
        bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(plan_id: u32)]
pub struct Subscribe<'info> {
    #[account(
        seeds = [b"program_state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        seeds = [b"plan", &plan_id.to_le_bytes()],
        bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        init,
        payer = user,
        space = 8 + UserSubscription::INIT_SPACE,
        seeds = [b"user_subscription", user.key().as_ref()],
        bump
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub program_vault: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(
        mut,
        seeds = [b"user_subscription", user.key().as_ref()],
        bump,
        has_one = user
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"program_state"],
        bump,
        has_one = owner
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump = program_state.vault_bump
    )]
    pub program_vault: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckSubscription<'info> {
    #[account(
        seeds = [b"user_subscription", user.key().as_ref()],
        bump
    )]
    pub user_subscription: Account<'info, UserSubscription>,

    /// CHECK: This is just for deriving the PDA
    pub user: AccountInfo<'info>,
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub owner: Pubkey,
    pub next_plan_id: u32,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SubscriptionPlan {
    pub plan_id: u32,
    pub price: u64,
    pub duration: i64, // in seconds
    pub active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct UserSubscription {
    pub user: Pubkey,
    pub plan_id: u32,
    pub start_time: i64,
    pub end_time: i64,
    pub active: bool,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PlanCreated {
    pub plan_id: u32,
    pub price: u64,
    pub duration: i64,
}

#[event]
pub struct Subscribed {
    pub user: Pubkey,
    pub plan_id: u32,
    pub end_time: i64,
}

#[event]
pub struct SubscriptionCancelled {
    pub user: Pubkey,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Plan does not exist or is inactive")]
    PlanInactive,
    #[msg("Invalid plan ID")]
    InvalidPlanId,
    #[msg("No active subscription to cancel")]
    NoActiveSubscription,
}

