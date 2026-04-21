import { NativeModules } from 'react-native'

type AppIconId = 'icon1' | 'icon2'

type AppIconNativeModule = {
  getCurrentIcon: () => Promise<AppIconId>
  setIcon: (iconId: AppIconId) => Promise<void>
}

const { AppIconModule } = NativeModules as { AppIconModule?: AppIconNativeModule }

const ensureModule = (): AppIconNativeModule => {
  if (!AppIconModule) throw new Error('AppIconModule is unavailable')
  return AppIconModule
}

export const getCurrentAppIcon = async(): Promise<AppIconId> => {
  return ensureModule().getCurrentIcon()
}

export const setCurrentAppIcon = async(icon: AppIconId): Promise<void> => {
  await ensureModule().setIcon(icon)
}
