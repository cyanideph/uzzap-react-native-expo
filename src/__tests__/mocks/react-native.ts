import React from 'react';

const View = ({ children, style, ...props }: any) => React.createElement('View', props, children);
const Text = ({ children, style, ...props }: any) => React.createElement('Text', props, children);
const ScrollView = ({ children, style, ...props }: any) =>
  React.createElement('ScrollView', props, children);
const FlatList = ({ children, data, renderItem, keyExtractor, ...props }: any) =>
  React.createElement(
    'FlatList',
    props,
    data?.map?.((item: any, i: number) => renderItem({ item, index: i })),
  );
const SectionList = ({
  children,
  sections,
  renderSectionHeader,
  renderItem,
  keyExtractor,
  ...props
}: any) =>
  React.createElement(
    'SectionList',
    props,
    sections?.flatMap?.((section: any, i: number) => renderItem({ item: section, index: i })),
  );
const Pressable = ({ children, onPress, style, ...props }: any) =>
  React.createElement('Pressable', { ...props, onClick: onPress }, children);
const TextInput = ({ value, onChangeText, placeholder, style, ...props }: any) =>
  React.createElement('TextInput', {
    ...props,
    value,
    onChange: (e: any) => onChangeText?.(e.target?.value ?? ''),
    placeholder,
  });
const KeyboardAvoidingView = ({ children, ...props }: any) =>
  React.createElement('KeyboardAvoidingView', props, children);
const ActivityIndicator = ({ style, ...props }: any) =>
  React.createElement('ActivityIndicator', props);
const Image = ({ style, ...props }: any) => React.createElement('Image', props);
const Modal = ({ children, visible, ...props }: any) =>
  visible ? React.createElement('Modal', props, children) : null;
const Alert = { alert: jest.fn() };
const Platform = { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default };
const StyleSheet = {
  create: (styles: any) => styles,
  hairlineWidth: 1,
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};
const Dimensions = { get: () => ({ width: 375, height: 812 }) };
const PixelRatio = { get: () => 2 };
const NativeModules = {
  PlatformConstants: { reactNativeVersion: { major: 0, minor: 76, patch: 9 } },
};
const AppRegistry = { registerComponent: jest.fn() };
const DeviceEventEmitter = { addListener: jest.fn(), removeListener: jest.fn(), emit: jest.fn() };

module.exports = {
  View,
  Text,
  ScrollView,
  FlatList,
  SectionList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
  Platform,
  StyleSheet,
  Dimensions,
  PixelRatio,
  NativeModules,
  AppRegistry,
  DeviceEventEmitter,
};
