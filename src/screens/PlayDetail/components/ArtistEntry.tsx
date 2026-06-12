import { memo, useCallback, useRef, useState, type ComponentProps } from 'react'
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native'

import Modal, { type ModalType } from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { useTheme } from '@/store/theme/hook'
import { loadArtistSongs, splitArtistNames } from '@/core/mediaLibrary/artistPage'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { toast } from '@/utils/tools'

type ArtistMatchMode = 'token' | 'exact'

interface ArtistOption {
  id: string
  label: string
  artistName: string
  matchMode: ArtistMatchMode
}

export interface ArtistEntryProps {
  singer: string
  size?: number
  textStyle?: ComponentProps<typeof Text>['style']
  textColor?: ComponentProps<typeof Text>['color']
}

const buildArtistOptions = (singer: string, exactLabelBuilder: (name: string) => string): ArtistOption[] => {
  const artists = splitArtistNames(singer)
  if (artists.length <= 1) {
    return artists.map(artist => ({ id: `token_${artist}`, label: artist, artistName: artist, matchMode: 'token' as const }))
  }

  return [
    ...artists.map(artist => ({ id: `token_${artist}`, label: artist, artistName: artist, matchMode: 'token' as const })),
    {
      id: `exact_${singer}`,
      label: exactLabelBuilder(singer),
      artistName: singer.trim(),
      matchMode: 'exact' as const,
    },
  ]
}

export default memo(({ singer, size = 12, textStyle, textColor }: ArtistEntryProps) => {
  const t = useI18n()
  const theme = useTheme()
  const modalRef = useRef<ModalType>(null)
  const [options, setOptions] = useState<ArtistOption[]>([])

  const openArtistPage = useCallback(async(option: ArtistOption) => {
    try {
      const list = await loadArtistSongs({ repository: mediaLibraryRepository, artistName: option.artistName, matchMode: option.matchMode })
      if (!list.length) {
        toast(t('artist_page_empty_in_library'))
        return
      }
      const componentId = commonState.componentIds.playDetail
      if (!componentId) return
      navigations.pushArtistPageScreen(componentId, {
        artistName: option.artistName,
        matchMode: option.matchMode,
        sourceSinger: singer,
      })
    } catch (error) {
      // 入口查询失败时停留在播放页，避免进入一个无法加载内容的空页面。
      console.warn('open artist page failed', error)
      toast(t('artist_page_load_failed'))
    }
  }, [singer, t])

  const handlePress = useCallback(() => {
    const normalizedSinger = singer.trim()
    if (!normalizedSinger) {
      toast(t('artist_page_no_artist_info'))
      return
    }

    const nextOptions = buildArtistOptions(normalizedSinger, name => t('artist_page_exact_match_option', { name }))
    if (!nextOptions.length) {
      toast(t('artist_page_no_artist_info'))
      return
    }
    if (nextOptions.length === 1) {
      void openArtistPage(nextOptions[0])
      return
    }
    setOptions(nextOptions)
    modalRef.current?.setVisible(true)
  }, [openArtistPage, singer, t])

  const handleSelect = useCallback((option: ArtistOption) => {
    modalRef.current?.setVisible(false)
    void openArtistPage(option)
  }, [openArtistPage])

  return (
    <>
      <Button style={styles.textButton} onPress={handlePress}>
        <Text numberOfLines={1} style={textStyle} size={size} color={textColor}>{singer}</Text>
      </Button>
      <Modal ref={modalRef} bgColor="rgba(0,0,0,0.35)">
        <View style={styles.sheetWrap}>
          <TouchableWithoutFeedback>
            <View style={{ ...styles.sheet, backgroundColor: theme['c-content-background'] }}>
              <Text style={styles.sheetTitle} color={theme['c-font']}>{t('artist_page_choose_artist_title')}</Text>
              {options.map(option => (
                <Button key={option.id} style={styles.optionButton} onPress={() => { handleSelect(option) }}>
                  <Text numberOfLines={1} color={theme['c-font']}>{option.label}</Text>
                </Button>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>
    </>
  )
})

const styles = StyleSheet.create({
  textButton: {
    alignSelf: 'stretch',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  sheetTitle: {
    marginBottom: 10,
    fontWeight: '700',
  },
  optionButton: {
    paddingVertical: 13,
  },
})
