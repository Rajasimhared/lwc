import { LightningElement, track } from 'lwc';

export default class BoundaryChildSlotThrow extends LightningElement {
    @track state = {};

    errorCallback(error) {
        this.state.error = error;
    }
}
