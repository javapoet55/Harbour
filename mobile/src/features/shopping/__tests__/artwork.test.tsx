import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { palettes } from '../../../theme';
import { GroceryArtwork } from '../components';

/**
 * `GroceryArtwork`: a photo that does not decode falls through like Swift's, and on Android the slot
 * shows a neutral basket tile until its picture has loaded (docs/android-polish.md §8).
 */
// The artwork is hidden from accessibility (it repeats the row's name), so every query includes it.
configure({ defaultIncludeHiddenElements: true });

const light = palettes.light;
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

afterEach(() => jest.restoreAllMocks());

describe('GroceryArtwork on both platforms', () => {
  it('drops a photo that fails to load to the illustration, then the illustration to the emoji', async () => {
    await render(<GroceryArtwork item={{ name: 'Milk', category: 'Dairy & Eggs', imageData: '/9j/AA==' }} />);
    expect(screen.getByTestId('grocery-artwork-photo')).toBeTruthy();

    await fireEvent(screen.getByTestId('grocery-artwork-photo'), 'error');
    expect(screen.queryByTestId('grocery-artwork-photo')).toBeNull();
    expect(screen.getByTestId('grocery-artwork-milk')).toBeTruthy();

    await fireEvent(screen.getByTestId('grocery-artwork-milk'), 'error');
    expect(screen.getByTestId('grocery-artwork-emoji').props.children).toBe('🥛');
  });

  it('draws the bundled illustration for Milk and Bananas', async () => {
    const { rerender } = await render(<GroceryArtwork item={{ name: 'Milk', category: 'Dairy & Eggs', imageData: null }} />);
    expect(screen.getByTestId('grocery-artwork-milk')).toBeTruthy();
    await rerender(<GroceryArtwork item={{ name: 'Bananas', category: 'Produce', imageData: null }} />);
    expect(screen.getByTestId('grocery-artwork-banana')).toBeTruthy();
  });
});

describe('GroceryArtwork on Android', () => {
  beforeEach(() => onPlatform('android'));

  it('fills the slot with the basket tile until the picture has loaded', async () => {
    await render(<GroceryArtwork item={{ name: 'Bananas', category: 'Produce', imageData: null }} />);
    const tile = screen.getByTestId('grocery-artwork-placeholder');
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({
      width: 40,
      height: 44,
      borderRadius: 8,
      backgroundColor: light.fieldSurface,
      borderColor: light.fieldBorder,
      borderWidth: StyleSheet.hairlineWidth,
    });

    await fireEvent(screen.getByTestId('grocery-artwork-banana'), 'load');
    expect(screen.queryByTestId('grocery-artwork-placeholder')).toBeNull();
  });

  it('keeps the tile while a broken photo falls through, then clears it when the illustration loads', async () => {
    await render(<GroceryArtwork item={{ name: 'Milk', category: 'Dairy & Eggs', imageData: '/9j/AA==' }} />);
    await fireEvent(screen.getByTestId('grocery-artwork-photo'), 'error');
    expect(screen.getByTestId('grocery-artwork-placeholder')).toBeTruthy();
    await fireEvent(screen.getByTestId('grocery-artwork-milk'), 'load');
    expect(screen.queryByTestId('grocery-artwork-placeholder')).toBeNull();
  });

  it('shows no tile behind an emoji', async () => {
    await render(<GroceryArtwork item={{ name: 'Cheddar cheese', category: 'Dairy & Eggs', imageData: null }} />);
    expect(screen.getByTestId('grocery-artwork-emoji')).toBeTruthy();
    expect(screen.queryByTestId('grocery-artwork-placeholder')).toBeNull();
  });
});

describe('GroceryArtwork on iOS', () => {
  beforeEach(() => onPlatform('ios'));

  it('never draws the tile', async () => {
    await render(<GroceryArtwork item={{ name: 'Bananas', category: 'Produce', imageData: null }} />);
    expect(screen.queryByTestId('grocery-artwork-placeholder')).toBeNull();
  });
});
