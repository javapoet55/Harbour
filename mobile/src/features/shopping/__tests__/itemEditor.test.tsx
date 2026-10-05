import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

const mockRecognize = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: { lists: jest.fn(), post: jest.fn(), alternatives: jest.fn(), image: jest.fn(), transcriptionSession: jest.fn() },
  shoppingStoresApi: { search: jest.fn(), brand: jest.fn(), recognize: (...args: unknown[]) => mockRecognize(...args), recommendations: jest.fn() },
}));
const mockChoose = jest.fn();
const mockTake = jest.fn();
jest.mock('../image', () => ({
  ...jest.requireActual('../image'),
  choosePhoto: () => mockChoose(),
  takePicture: () => mockTake(),
  encodeItemImage: async (uri: string) => `/9j/${uri}`,
}));

import { ApiError } from '../../../api/client';
import type { GroceryItem } from '../../../api/shopping';
import { CAMERA_DENIED } from '../image';
import { capitalizeFirstLetter, IDENTIFY_MESSAGE, IDENTIFY_TITLE, IDENTIFY_UNAVAILABLE, ItemEditorSheet } from '../ItemEditorSheet';

/** `ShoppingItemEditor` (ios/App/ShoppingItemEditor.swift) since `8c36d98`. */

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { id: 'i1', name: 'mango', category: 'Other', quantity: '1', size: '', notes: '', imageData: null, checked: false, ...overrides };
}

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

const press = (title: string) =>
  act(async () => (alert.mock.calls[alert.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[]).find((button) => button.text === title)?.onPress?.());

describe('Edit Item', () => {
  it('capitalizes the name once, and has Brand and "+ Add Notes"; the image section starts collapsed', async () => {
    const onSave = jest.fn();
    await render(<ItemEditorSheet item={item()} onClose={jest.fn()} onSave={onSave} />);
    expect(screen.getByText('Edit Item')).toBeTruthy();
    expect(screen.getByTestId('item-name').props.value).toBe('Mango');
    expect(screen.getByTestId('shopping.item.brand').props.placeholder).toBe('Brand');
    expect(screen.getByLabelText('Notes').props.placeholder).toBe('+ Add Notes');
    expect(screen.queryByTestId('item-photos')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('shopping.item.brand'), 'Kirkland');
    await fireEvent.press(screen.getByTestId('item-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mango', brand: 'Kirkland' }));
    expect(capitalizeFirstLetter('  2% milk')).toBe('  2% Milk');
    expect(capitalizeFirstLetter('éclair')).toBe('Éclair');
  });

  it('asks before identifying a chosen photo, then fills only the fields left unchanged', async () => {
    mockChoose.mockResolvedValue('photo.jpg');
    mockRecognize.mockResolvedValue({ name: 'Mango', brand: 'Del Monte', category: 'Produce', confidence: 'high' });
    await render(<ItemEditorSheet item={item({ name: '' })} onClose={jest.fn()} onSave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('item-image-toggle'));
    await fireEvent.press(screen.getByTestId('item-photos'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(IDENTIFY_TITLE, IDENTIFY_MESSAGE, expect.any(Array)));
    expect(mockRecognize).not.toHaveBeenCalled();
    await press('Fill Details');
    await waitFor(() => expect(screen.getByTestId('item-notice')).toHaveTextContent('AI suggested these details. Check the name and brand before saving.'));
    expect(mockRecognize).toHaveBeenCalledWith('/9j/photo.jpg');
    expect(screen.getByTestId('item-name').props.value).toBe('Mango');
    expect(screen.getByTestId('shopping.item.brand').props.value).toBe('Del Monte');
    // Consent is asked once per editor: the next identification goes straight through.
    alert.mockClear();
    await fireEvent.press(screen.getByTestId('shopping.photo.identify'));
    await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(2));
    expect(alert).not.toHaveBeenCalled();
  });

  it('"Enter Manually" sends nothing; a 404 says identification is unavailable', async () => {
    mockChoose.mockResolvedValue('photo.jpg');
    mockRecognize.mockRejectedValue(new ApiError({ status: 404, message: 'Not found' }));
    await render(<ItemEditorSheet item={item()} onClose={jest.fn()} onSave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('item-image-toggle'));
    await fireEvent.press(screen.getByTestId('item-photos'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await press('Enter Manually');
    expect(mockRecognize).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('shopping.photo.identify'));
    await press('Fill Details');
    await waitFor(() => expect(screen.getByTestId('item-error')).toHaveTextContent(IDENTIFY_UNAVAILABLE));
  });

  it('shows "I’m working…" while identifying, and the server’s message when it is unsure', async () => {
    mockChoose.mockResolvedValue('photo.jpg');
    let reject: (error: Error) => void = () => undefined;
    mockRecognize.mockReturnValue(new Promise((_, failure) => (reject = failure)));
    await render(<ItemEditorSheet item={item()} onClose={jest.fn()} onSave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('item-image-toggle'));
    await fireEvent.press(screen.getByTestId('item-photos'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await press('Fill Details');
    expect(screen.getByText('I’m working…')).toBeTruthy();
    await act(async () => reject(new Error('Could not identify one item clearly. Take a closer photo or enter its details manually.')));
    expect(screen.getByTestId('item-error')).toHaveTextContent('Could not identify one item clearly. Take a closer photo or enter its details manually.');
    expect(screen.queryByText('I’m working…')).toBeNull();
  });

  it('opens the photo full screen with zoom', async () => {
    await render(<ItemEditorSheet item={item({ imageData: '/9j/abc' })} onClose={jest.fn()} onSave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('item-image-toggle'));
    await fireEvent.press(screen.getByTestId('shopping.photo.preview'));
    expect(screen.getAllByText('Item Image')).toHaveLength(2);
    expect(screen.getByLabelText('Zoom out').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Zoom in'));
    expect(screen.getByLabelText('Zoom out').props.accessibilityState.disabled).toBe(false);
  });
});

describe('Add Item with the camera', () => {
  it('opens the camera at once and offers to identify the picture', async () => {
    mockTake.mockResolvedValue('camera.jpg');
    await render(<ItemEditorSheet item={item({ name: '' })} launchCamera onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByText('Add Item')).toBeTruthy();
    await waitFor(() => expect(mockTake).toHaveBeenCalled());
    await waitFor(() => expect(alert).toHaveBeenCalledWith(IDENTIFY_TITLE, IDENTIFY_MESSAGE, expect.any(Array)));
    expect(screen.getByTestId('item-image')).toBeTruthy();
  });

  it('closes when the camera is cancelled with no photo', async () => {
    mockTake.mockResolvedValue(null);
    const onClose = jest.fn();
    await render(<ItemEditorSheet item={item({ name: '' })} launchCamera onClose={onClose} onSave={jest.fn()} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says camera access is off, with Open Settings', async () => {
    mockTake.mockRejectedValue(new Error(CAMERA_DENIED));
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await render(<ItemEditorSheet item={item({ name: '' })} launchCamera onClose={jest.fn()} onSave={jest.fn()} />);
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Camera access is off', 'Allow camera access in Settings to take an item photo. You can also choose a photo from your library.', expect.any(Array)),
    );
    await press('Open Settings');
    expect(settings).toHaveBeenCalled();
    settings.mockRestore();
  });
});
