import { NativeModules } from 'react-native'

export interface OneDriveBusinessAccount {
  homeAccountId: string | null
  username: string | null
  authority: string | null
}

const { OneDriveAuthModule } = NativeModules

export const signInOneDriveBusiness = async(): Promise<OneDriveBusinessAccount | null> => {
  return OneDriveAuthModule.signIn()
}

export const signOutOneDriveBusiness = async(): Promise<boolean> => {
  return OneDriveAuthModule.signOut()
}

export const getOneDriveBusinessAccount = async(): Promise<OneDriveBusinessAccount | null> => {
  return OneDriveAuthModule.getCurrentAccount()
}

export const getOneDriveBusinessAccessToken = async(): Promise<string | null> => {
  return OneDriveAuthModule.getAccessToken()
}
