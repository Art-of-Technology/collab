import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewRenderer, NodeViewRendererProps, ReactNodeViewRenderer } from '@tiptap/react';
import { EditorState, Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { LinkPreviewCard } from '../components/LinkPreviewCard';
import React from 'react';
import ReactDOM from 'react-dom/client';

export interface LinkPreviewData {
    type: 'internal' | 'external';
    subtype?: 'note' | 'issue';
    title: string;
    description: string;
    url: string;
    image: string | null;
    metadata?: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        linkPreview: {
            setLinkPreview: (url: string) => ReturnType;
            removeLinkPreview: () => ReturnType;
        };
    }
}

export const LinkPreviewExtension = Node.create({
    name: 'linkPreview',

    group: 'block',

    atom: true,

    draggable: false,

    addAttributes() {
        return {
            url: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-url'),
                renderHTML: (attributes) => {
                    if (!attributes.url) {
                        return {};
                    }
                    return { 'data-url': attributes.url };
                },
            },
            preview: {
                default: null,
                parseHTML: (element) => {
                    const preview = element.getAttribute('data-preview');
                    return preview ? JSON.parse(preview) : null;
                },
                renderHTML: (attributes) => {
                    if (!attributes.preview) {
                        return {};
                    }
                    return { 'data-preview': JSON.stringify(attributes.preview) };
                },
            },
            showPreview: {
                default: true,
                parseHTML: (element) => {
                    return element.getAttribute('data-show-preview') !== 'false';
                },
                renderHTML: (attributes) => {
                    return { 'data-show-preview': String(attributes.showPreview !== false) };
                },
            },
            isLoading: {
                default: false,
                parseHTML: () => false,
                renderHTML: () => ({}),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="link-preview"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes({ 'data-type': 'link-preview' }, HTMLAttributes)];
    },

    addNodeView() {
        return ((props: NodeViewRendererProps) => {
            const { node, editor, getPos } = props;

            const container = document.createElement('div');
            container.classList.add('link-preview-node');
            container.style.margin = '0.5rem 0';
            container.contentEditable = 'false';

            let root: any = null;
            let currentNode = node;

            const render = (nodeToRender = currentNode) => {
                const { url, preview, showPreview, isLoading } = nodeToRender.attrs;
                if (showPreview && (preview || isLoading)) {
                    if (!root) {
                        root = ReactDOM.createRoot(container);
                    }

                    if (preview) {
                        root.render(
                            React.createElement(LinkPreviewCard, {
                                preview,
                                isLoading: isLoading || false,
                                isEditable: editor.isEditable,
                                onRemove: () => {
                                    if (typeof getPos === 'function') {
                                        const pos = getPos();
                                        if (typeof pos === 'number') {
                                            editor.commands.command(({ tr }) => {
                                                tr.delete(pos, pos + currentNode.nodeSize);
                                                return true;
                                            });
                                        }
                                    }
                                },
                                onRefresh: async () => {
                                    if (typeof getPos === 'function') {
                                        const pos = getPos();
                                        if (typeof pos === 'number') {
                                            editor.commands.command(({ tr }) => {
                                                tr.setNodeMarkup(pos, undefined, {
                                                    ...currentNode.attrs,
                                                    isLoading: true,
                                                });
                                                return true;
                                            });

                                            try {
                                                const response = await fetch('/api/link-preview', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({ url }),
                                                });

                                                if (response.ok) {
                                                    const newPreview = await response.json();

                                                    editor.commands.command(({ tr }) => {
                                                        const currentPos = getPos();
                                                        if (typeof currentPos === 'number') {
                                                            tr.setNodeMarkup(currentPos, undefined, {
                                                                ...currentNode.attrs,
                                                                preview: newPreview,
                                                                isLoading: false,
                                                            });
                                                            return true;
                                                        }
                                                        return false;
                                                    });
                                                }
                                            } catch (error) {
                                                console.error('Error refreshing preview:', error);
                                                editor.commands.command(({ tr }) => {
                                                    const currentPos = getPos();
                                                    if (typeof currentPos === 'number') {
                                                        tr.setNodeMarkup(currentPos, undefined, {
                                                            ...currentNode.attrs,
                                                            isLoading: false,
                                                        });
                                                        return true;
                                                    }
                                                    return false;
                                                });
                                            }
                                        }
                                    }
                                },
                            })
                        );
                    } else if (isLoading) {
                        root.render(
                            React.createElement('div', {
                                className: 'my-3 p-4 rounded-lg border border-white/5 bg-black/40 animate-pulse',
                            }, [
                                React.createElement('div', { key: 'loader', className: 'flex items-center gap-2 text-sm text-muted-foreground' }, [
                                    React.createElement('div', { key: 'spinner', className: 'animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent' }),
                                    React.createElement('span', { key: 'text' }, 'Loading preview...'),
                                ])
                            ])
                        );
                    }
                } else if (!showPreview && url) {
                    container.innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">${url}</a>`;
                }
            };

            render();

            return {
                dom: container,
                update: (updatedNode) => {
                    if (updatedNode.type.name !== 'linkPreview') {
                        return false;
                    }

                    currentNode = updatedNode;
                    render(updatedNode);
                    return true;
                },
                destroy: () => {
                    if (root) {
                        setTimeout(() => {
                            root.unmount();
                        }, 0);
                    }
                },
            };
        }) as NodeViewRenderer;
    },

    addProseMirrorPlugins() {
        const extensionThis = this as any;

        return [
            new Plugin({
                key: new PluginKey('linkPreviewPaste'),
                props: {
                    handlePaste(view, event, slice) {
                        const text = event.clipboardData?.getData('text/plain');

                        if (text && /^https?:\/\//.test(text.trim())) {
                            const url = text.trim();

                            const { state, dispatch } = view;
                            const node = state.schema.nodes.linkPreview.create({
                                url,
                                isLoading: true,
                                showPreview: true,
                            });

                            const tr = state.tr.replaceSelectionWith(node);
                            dispatch(tr);

                            (async () => {
                                try {
                                    const response = await fetch('/api/link-preview', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ url }),
                                    });

                                    if (response.ok) {
                                        const preview = await response.json();

                                        const currentState = extensionThis.editor.view.state;
                                        const updateTr = currentState.tr;
                                        let found = false;

                                        currentState.doc.descendants((node: any, pos: number) => {
                                            if (
                                                node.type.name === 'linkPreview' &&
                                                node.attrs.url === url &&
                                                node.attrs.isLoading
                                            ) {
                                                updateTr.setNodeMarkup(pos, undefined, {
                                                    url,
                                                    preview,
                                                    showPreview: true,
                                                    isLoading: false,
                                                });
                                                found = true;
                                                return false;
                                            }
                                        });

                                        if (found) {
                                            extensionThis.editor.view.dispatch(updateTr);
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error fetching link preview:', error);

                                    const currentState = extensionThis.editor.view.state;
                                    const updateTr = currentState.tr;

                                    currentState.doc.descendants((node: any, pos: number) => {
                                        if (
                                            node.type.name === 'linkPreview' &&
                                            node.attrs.url === url &&
                                            node.attrs.isLoading
                                        ) {
                                            updateTr.setNodeMarkup(pos, undefined, {
                                                ...node.attrs,
                                                isLoading: false,
                                            });
                                            return false;
                                        }
                                    });

                                    extensionThis.editor.view.dispatch(updateTr);
                                }
                            })();

                            return true;
                        }

                        return false;
                    },
                },
            }),
        ];
    },

    addCommands() {
        return {
            setLinkPreview:
                (url: string) =>
                    ({ commands }) => {
                        return commands.insertContent({
                            type: this.name,
                            attrs: {
                                url,
                                isLoading: true,
                                showPreview: true,
                            },
                        });
                    },
            removeLinkPreview:
                () =>
                    ({ commands }) => {
                        return commands.deleteNode(this.name);
                    },
        };
    },
});

