# Gamma Referral Program

This is a guide for the Gamma Referral Program. With the referral program, if you refer a swap on the platform, a part of the swap fee is given to your account.

## How to get started

To start the referral program, you need to create a referral account by going to the [Gamma Referral Program](https://referral.jup.ag/) page.

Once this is done you are all set for the referral program.

## Sending Swap Instructions

To send swap instructions to the referral program, you need to add the `referral_public_key` parameter to the swap instructions.

The `referral_public_key` is the public key of the referral account you created.
```typescript
const cpmmModule = new CpmmModule(config)

const swapInstruction = cpmmModule.swap(
 referralAccounts:{
    referralAccount,
    referralTokenAccountWithInputMint // Initialize this token account before sending the swap instruction.
 }
)
```
Once the swap instruction the referral amounts is added to the provided account.


To withdraw the referral amounts