import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import Text from '@/components/common/Text'

export interface SourceConnectionDraft {
  connectionId?: string
  providerType: 'local' | 'webdav' | 'smb'
  displayName: string
  rootPathOrUri: string
  credentials?: {
    host?: string
    share?: string
    username?: string
    password?: string
  }
}

const createEmptyDraft = (): SourceConnectionDraft => ({
  providerType: 'local',
  displayName: '',
  rootPathOrUri: '',
  credentials: {},
})

const normalizeDraft = (draft?: SourceConnectionDraft | null): SourceConnectionDraft => ({
  ...createEmptyDraft(),
  ...draft,
  credentials: {
    ...createEmptyDraft().credentials,
    ...draft?.credentials,
  },
})

export default ({ visible, draft, onSubmit, onCancel }: {
  visible: boolean
  draft?: SourceConnectionDraft | null
  onSubmit: (draft: SourceConnectionDraft) => void
  onCancel: () => void
}) => {
  const [form, setForm] = useState<SourceConnectionDraft>(createEmptyDraft())

  useEffect(() => {
    setForm(normalizeDraft(draft))
  }, [draft, visible])

  if (!visible) return null

  return (
    <View style={styles.container}>
      <Text>来源类型</Text>
      <View style={styles.providerRow}>
        {(['local', 'webdav', 'smb'] as const).map(providerType => (
          <Pressable
            key={providerType}
            style={[styles.providerButton, form.providerType === providerType ? styles.providerButtonActive : null]}
            onPress={() => {
              setForm(prev => ({ ...prev, providerType }))
            }}
          >
            <Text>{providerType}</Text>
          </Pressable>
        ))}
      </View>

      <Text>来源名称</Text>
      <TextInput
        style={styles.input}
        value={form.displayName}
        onChangeText={displayName => {
          setForm(prev => ({ ...prev, displayName }))
        }}
      />

      <Text>根路径或 URI</Text>
      <TextInput
        style={styles.input}
        value={form.rootPathOrUri}
        onChangeText={rootPathOrUri => {
          setForm(prev => ({ ...prev, rootPathOrUri }))
        }}
      />

      {form.providerType !== 'local'
        ? <>
            <Text>用户名</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.username ?? ''}
              onChangeText={username => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, username },
                }))
              }}
            />

            <Text>密码</Text>
            <TextInput
              style={styles.input}
              secureTextEntry={true}
              value={form.credentials?.password ?? ''}
              onChangeText={password => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, password },
                }))
              }}
            />
          </>
        : null}

      {form.providerType === 'smb'
        ? <>
            <Text>主机</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.host ?? ''}
              onChangeText={host => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, host },
                }))
              }}
            />

            <Text>共享名</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.share ?? ''}
              onChangeText={share => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, share },
                }))
              }}
            />
          </>
        : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={() => { onSubmit(form) }}>
          <Text>保存</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onCancel}>
          <Text>取消</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  providerRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 12,
  },
  providerButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  providerButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  input: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
})
