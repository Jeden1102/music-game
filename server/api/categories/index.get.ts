import { listCategories } from '../../utils/game-songs'

export default defineEventHandler(async () => {
  return listCategories()
})
