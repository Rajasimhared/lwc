/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { assert, isFalse, isFunction, isUndefined } from '@lwc/shared';
import {
    invokeComponentConstructor,
    invokeComponentRenderMethod,
    isInvokingRender,
    invokeEventListener,
} from './invoker';
import { VM, scheduleRehydration } from './vm';
import { ReactiveObserver } from '../libs/mutation-tracker';
import { LightningElementConstructor } from './base-lightning-element';
import { getVMBeingRendered, TemplateFactory } from './template';

export type ErrorCallback = (error: any, stack: string) => void;
export interface ComponentInterface {
    // TODO [#1291]: complete the entire interface used by the engine
    setAttribute(attrName: string, value: any): void;
}

export interface ComponentConstructor extends LightningElementConstructor {
    readonly name: string;
    readonly labels?: string[];
    readonly delegatesFocus?: boolean;
}

export interface ComponentMeta {
    readonly name: string;
    readonly template?: TemplateFactory;
}

const signedComponentToMetaMap: Map<ComponentConstructor, ComponentMeta> = new Map();

/**
 * INTERNAL: This function can only be invoked by compiled code. The compiler
 * will prevent this function from being imported by userland code.
 */
export function registerComponent(
    Ctor: ComponentConstructor,
    { name, tmpl: template }: { name: string; tmpl: TemplateFactory }
): ComponentConstructor {
    signedComponentToMetaMap.set(Ctor, { name, template });
    // chaining this method as a way to wrap existing
    // assignment of component constructor easily, without too much transformation
    return Ctor;
}

export function getComponentRegisteredMeta(Ctor: ComponentConstructor): ComponentMeta | undefined {
    return signedComponentToMetaMap.get(Ctor);
}

export function createComponent(vm: VM, Ctor: ComponentConstructor) {
    // create the component instance
    invokeComponentConstructor(vm, Ctor);

    if (isUndefined(vm.component)) {
        throw new ReferenceError(
            `Invalid construction for ${Ctor}, you must extend LightningElement.`
        );
    }
}

export function getTemplateReactiveObserver(vm: VM): ReactiveObserver {
    return new ReactiveObserver(() => {
        const { isDirty } = vm;
        if (isFalse(isDirty)) {
            markComponentAsDirty(vm);
            scheduleRehydration(vm);
        }
    });
}

export function renderComponent(vm: VM): void {
    if (process.env.NODE_ENV !== 'production') {
        assert.invariant(vm.isDirty, `${vm} is not dirty.`);
    }

    vm.tro.reset();
    invokeComponentRenderMethod(vm);
    
    vm.isDirty = false;
    vm.isScheduled = false;
}

export function markComponentAsDirty(vm: VM) {
    if (process.env.NODE_ENV !== 'production') {
        const vmBeingRendered = getVMBeingRendered();
        assert.isFalse(
            vm.isDirty,
            `markComponentAsDirty() for ${vm} should not be called when the component is already dirty.`
        );
        assert.isFalse(
            isInvokingRender,
            `markComponentAsDirty() for ${vm} cannot be called during rendering of ${vmBeingRendered}.`
        );
    }
    vm.isDirty = true;
}

const cmpEventListenerMap: WeakMap<EventListener, EventListener> = new WeakMap();

export function getWrappedComponentsListener(vm: VM, listener: EventListener): EventListener {
    if (!isFunction(listener)) {
        throw new TypeError(); // avoiding problems with non-valid listeners
    }
    let wrappedListener = cmpEventListenerMap.get(listener);
    if (isUndefined(wrappedListener)) {
        wrappedListener = function (event: Event) {
            invokeEventListener(vm, listener, undefined, event);
        };
        cmpEventListenerMap.set(listener, wrappedListener);
    }
    return wrappedListener;
}
