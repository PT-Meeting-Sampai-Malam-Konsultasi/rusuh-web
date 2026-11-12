import type { FileSaverProtocol } from '@core/protocols/file-saver.protocol';

/**
 * A temporary object URL and a hidden link: works for a Blob from the API and for text built on the page. The document
 * is read on save, never at creation (the static export prerenders pages without one).
 */
export function createFileSaver(getDocument: () => Document = () => document): FileSaverProtocol {
  return {
    save: (data, filename, type = 'text/plain') => {
      const doc = getDocument();
      const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
      const url = URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      doc.body.appendChild(link);
      link.click();
      link.remove();
      // Some browsers start the download after click() returns; free the URL on the next tick.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}
