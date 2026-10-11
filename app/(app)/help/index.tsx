import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, TextField, TitleBar } from '@/components/ui';
import { useTheme } from '@/theme';

interface HelpSection {
  id: string;
  title: string;
  body: string;
}

/**
 * Help content mirrors `assets/help0.txt` (registration / login) and
 * `assets/help.txt` (the in-app help carousel text).
 */
const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'registration',
    title: 'Uzzap Registration',
    body:
      'To register a user account, select "register a new account" and enter:\n\n' +
      '• User ID — 6 to 12 characters, letters and numbers only.\n' +
      '• Mobile Phone Number — full international format, e.g. +639205008429.\n' +
      '• First Name / Last Name — as they will appear on your profile.\n' +
      '• Email Address — used to recover your login details.\n' +
      '• Password — at least 6 characters; retype it to verify.',
  },
  {
    id: 'login',
    title: 'Logging In',
    body:
      'Select "Log In" and enter your User ID and Password. You can choose to be remembered so next time ' +
      'you log straight in. In Settings select Auto Start to log in automatically when your phone starts.\n\n' +
      'On your first login — or after changing your mobile number — you will be asked for a validation pin.',
  },
  {
    id: 'intro',
    title: 'Intro Help',
    body:
      'The Intro Help screen you saw when you first joined can be seen again from Options on the Main Menu, ' +
      'then choosing "Intro Help Screen".',
  },
  {
    id: 'adding-buddies',
    title: 'Adding New Buddies',
    body:
      'Press "Add or Invite Buddies" on the Main Menu and choose to add manually or from your phonebook. ' +
      'If you know their User ID you can add them directly.',
  },
  {
    id: 'sending',
    title: 'Sending a Message',
    body:
      'Open your Buddy List, choose a buddy, then Send Message. Type your message and press send — or use ' +
      'Options to add an emoticon or copy it to other buddies.',
  },
  {
    id: 'arrow',
    title: 'Arrow Symbol — Sending Indicator',
    body:
      'The arrow means a sent message has not yet been confirmed as received. This can happen during a call ' +
      'or in a bad signal area. Uzzap keeps retrying automatically; the arrow clears when delivery is ' +
      'confirmed. If the buddy is reachable only by SMS, the arrow clears as soon as the SMS is sent.',
  },
  {
    id: 'unread',
    title: 'Unread Messages Indicator',
    body: 'The red symbol means a new message has arrived that you have not read.',
  },
  {
    id: 'shortcuts',
    title: 'Messaging Shortcuts',
    body:
      'Reply simply by starting to type while viewing a message. You can find a buddy quickly — even from ' +
      'the Main Menu — by typing their name.',
  },
  {
    id: 'invite',
    title: 'Invite Friends',
    body:
      'Invite friends so you get unlimited chat. Invite from "Add or Invite Buddies" — Uzzap can invite via ' +
      'SMS, Email or IM.',
  },
  {
    id: 'send-contacts',
    title: 'Send Contacts',
    body:
      'To share Buddy details, pick the person to send to and select "Send Contacts", then choose the ' +
      'buddies you wish to send.',
  },
  {
    id: 'status',
    title: 'User Status',
    body:
      'Change your status from "Change Status" on the Main Menu or by selecting yourself at the top of the ' +
      'Buddy List. You can also set a custom Status Message.',
  },
  {
    id: 'sms',
    title: 'Available by SMS',
    body:
      'From the Main Menu choose Settings then "Offline Settings" to decide how messages reach you when ' +
      'you are logged out: SMS, Email, or stored on the server until you log in again.',
  },
  {
    id: 'esms',
    title: 'Sending SMS and ESMS',
    body:
      'Contacts who are not Uzzap members can still receive enhanced messages. Select one of these ' +
      'contacts and choose the SMS option. A bucket of ESMS is included in your subscription.',
  },
  {
    id: 'call',
    title: 'Making a Phone Call',
    body:
      'From your Buddy List or a Message window, press the green Call button to call the selected Buddy ' +
      '(supported on some handset models).',
  },
  {
    id: 'hide',
    title: 'Hide Application',
    body:
      'You may continue using other apps and remain online by choosing "Hide application" in Options. ' +
      'Uzzap keeps running in the background and can display new messages automatically.',
  },
  {
    id: 'change-number',
    title: 'Changing your Mobile Number',
    body:
      'Press Settings then "Change Mobile Number". Enter the new number and wait for the PIN by SMS. Next ' +
      'time you log in you will be prompted to enter this PIN.',
  },
  {
    id: 'logoff',
    title: 'Log Off and Exit Application',
    body:
      'Log Off returns you to the Log In and Registration screen. Exit Application shuts Uzzap down ' +
      'completely.',
  },
];

/** Help & FAQ with a client-side search and accordion sections. */
export default function HelpScreen(): React.ReactElement {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>(['intro']);

  const sections = useMemo<HelpSection[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return HELP_SECTIONS;
    return HELP_SECTIONS.filter(
      (section) =>
        section.title.toLowerCase().includes(needle) || section.body.toLowerCase().includes(needle),
    );
  }, [query]);

  const toggle = (id: string): void => {
    setExpanded((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  };

  return (
    <Screen edges={['top']}>
      <TitleBar
        title="HELP"
        onBack={() => {
          if (router.canGoBack()) router.back();
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search help"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.size.body,
              textAlign: 'center',
            }}
          >
            {`No matches for "${query}"`}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {sections.map((section) => {
            const isOpen = expanded.includes(section.id);
            return (
              <View
                key={section.id}
                style={[styles.section, { borderBottomColor: theme.colors.border.divider }]}
              >
                <Pressable
                  onPress={() => toggle(section.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={styles.sectionHeader}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.size.bodyLg,
                      fontWeight: '600',
                    }}
                  >
                    {section.title}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.bodyLg,
                      transform: [{ rotate: isOpen ? '90deg' : '0deg' }],
                    }}
                  >
                    {'›'}
                  </Text>
                </Pressable>
                {isOpen ? (
                  <Text
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.size.body * theme.typography.lineHeight.relaxed,
                      paddingBottom: 12,
                    }}
                  >
                    {section.body}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <Text
            style={{
              color: theme.colors.text.disabled,
              fontSize: theme.typography.size.xxs,
              textAlign: 'center',
              marginTop: 24,
            }}
          >
            {'Copyright (c) 2007/2008 3rd Brand Pte Ltd. All Rights Reserved.'}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
});
