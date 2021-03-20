import { Component, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DbService } from './db.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  heros$?: BehaviorSubject<any[]>

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    await this.db.setup()
    this.heros$ = this.db.heros$
  }

  async add() {
    await this.db.add()
  }

  async remove(id: string) {
    await this.db.remove(id)
  }

  async forceReplication() {
    await this.db.forceReplication()
  }

}
